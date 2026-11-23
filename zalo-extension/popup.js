// Popup / options page: store API URL + x-webhook-key, test the connection, show recent sends.

const DEFAULTS = {
  apiUrl: "http://localhost:8081/api/integrations/zalo/webhook",
  webhookKey: "",
  webUrl: "http://localhost:8080",
};
// Origins already granted in manifest.json "host_permissions".
const BUILTIN_ORIGINS = ["http://localhost:8081", "http://127.0.0.1:8081"];

const $ = (id) => document.getElementById(id);
const form = $("settings");
const statusEl = $("status");

function showStatus(kind, text) {
  statusEl.className = kind;
  statusEl.textContent = text;
}

function readForm() {
  return {
    apiUrl: $("apiUrl").value.trim(),
    webhookKey: $("webhookKey").value.trim(),
    webUrl: ($("webUrl").value.trim() || DEFAULTS.webUrl).replace(/\/+$/, ""),
  };
}

function validate({ apiUrl, webhookKey }) {
  let url;
  try {
    url = new URL(apiUrl);
  } catch {
    return "API URL không hợp lệ.";
  }
  if (!/^https?:$/.test(url.protocol)) return "API URL phải bắt đầu bằng http:// hoặc https://";
  if (!webhookKey) return "Vui lòng nhập x-webhook-key.";
  return null;
}

/** Ask for host access when the API lives somewhere other than the built-in localhost:8081. */
async function ensureHostPermission(apiUrl) {
  const origin = new URL(apiUrl).origin;
  if (BUILTIN_ORIGINS.includes(origin)) return true;
  // Call request() first thing (no await before it): Chrome only shows the prompt inside the click's
  // user gesture. It resolves true immediately if the origin is already granted.
  return chrome.permissions.request({ origins: [`${origin}/*`] });
}

function pingUrlFrom(apiUrl) {
  return apiUrl.replace(/\/webhook\/?$/, "/ping");
}

async function load() {
  const s = await chrome.storage.local.get([...Object.keys(DEFAULTS), "history"]);
  $("apiUrl").value = s.apiUrl || DEFAULTS.apiUrl;
  $("webhookKey").value = s.webhookKey || "";
  $("webUrl").value = s.webUrl || DEFAULTS.webUrl;
  renderHistory(s.history || []);
  if (!s.webhookKey) showStatus("info", "Dán x-webhook-key rồi bấm Lưu để bắt đầu.");
}

function renderHistory(items) {
  const list = $("history");
  list.replaceChildren();
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Chưa gửi tin nhắn nào.";
    list.append(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = `dot ${item.ok ? "ok" : "err"}`;
    const body = document.createElement("div");
    const main = document.createElement("div");
    main.textContent = item.ok ? `${item.title}${item.isMock ? " (tóm tắt mẫu)" : ""}` : item.error;
    const time = document.createElement("div");
    time.className = "time";
    time.textContent = new Date(item.at).toLocaleString("vi-VN");
    body.append(main, time);
    li.append(dot, body);
    list.append(li);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const values = readForm();
  const error = validate(values);
  if (error) return showStatus("err", error);

  if (!(await ensureHostPermission(values.apiUrl))) {
    return showStatus("err", "Cần cấp quyền truy cập địa chỉ API để extension gửi được tin nhắn.");
  }
  await chrome.storage.local.set(values);
  showStatus("ok", "Đã lưu. Bôi đen tin nhắn trên chat.zalo.me → chuột phải → Gửi vào WorkBrief AI.");
});

$("test").addEventListener("click", async () => {
  const values = readForm();
  const error = validate(values);
  if (error) return showStatus("err", error);
  if (!(await ensureHostPermission(values.apiUrl))) {
    return showStatus("err", "Cần cấp quyền truy cập địa chỉ API để kiểm tra kết nối.");
  }

  const btn = $("test");
  btn.disabled = true;
  showStatus("info", "Đang kiểm tra…");
  try {
    const res = await fetch(pingUrlFrom(values.apiUrl), { headers: { "x-webhook-key": values.webhookKey } });
    const body = await res.json().catch(() => null);
    if (res.ok && body && body.success) {
      const q = body.data.aiQuota;
      showStatus("ok", `✓ ${body.message}. Còn ${q.remaining}/${q.limit} lượt AI.`);
    } else {
      showStatus("err", (body && body.message) || `Máy chủ trả về lỗi ${res.status}.`);
    }
  } catch (err) {
    showStatus("err", `Không kết nối được máy chủ (${err.message}). Backend đã chạy chưa?`);
  } finally {
    btn.disabled = false;
  }
});

$("toggleKey").addEventListener("click", () => {
  const input = $("webhookKey");
  input.type = input.type === "password" ? "text" : "password";
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.history) renderHistory(changes.history.newValue || []);
});

load();
