// WorkBrief AI – Zalo (Manifest V3 service worker)
// Right-click a selection on chat.zalo.me → "Gửi vào WorkBrief AI" → POST to the WorkBrief webhook,
// which summarises the message with AI and creates a task.

const MENU_ID = "workbrief-send-selection";
const DEFAULTS = {
  apiUrl: "http://localhost:8081/api/integrations/zalo/webhook",
  webhookKey: "",
  webUrl: "http://localhost:8080",
};
const MIN_LENGTH = 10;
const MAX_LENGTH = 20000;
const HISTORY_SIZE = 10;

/* ----------------------------------------------------------- Setup -- */

chrome.runtime.onInstalled.addListener(async (details) => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Gửi vào WorkBrief AI",
    contexts: ["selection"],
    documentUrlPatterns: ["https://chat.zalo.me/*"],
  });

  if (details.reason === "install") {
    const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
    await chrome.storage.local.set({ ...DEFAULTS, ...stored });
    // First run: open the settings so the user can paste their webhook key.
    chrome.runtime.openOptionsPage();
  }
});

/* --------------------------------------------------------- Helpers -- */

async function getSettings() {
  const s = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return {
    apiUrl: (s.apiUrl || DEFAULTS.apiUrl).trim(),
    webhookKey: (s.webhookKey || "").trim(),
    webUrl: (s.webUrl || DEFAULTS.webUrl).trim().replace(/\/+$/, ""),
  };
}

/** Success notifications ("wb-ok-*") open the task list when clicked. */
function notify(title, message, { isError = false } = {}) {
  chrome.notifications.create(`wb-${isError ? "err" : "ok"}-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message: message.slice(0, 250),
    priority: isError ? 2 : 0,
  });
}

// The service worker may have been restarted since the notification was shown, so derive the URL
// from settings instead of keeping it in memory.
chrome.notifications.onClicked.addListener(async (id) => {
  chrome.notifications.clear(id);
  if (!id.startsWith("wb-ok-")) return;
  const { webUrl } = await getSettings();
  chrome.tabs.create({ url: `${webUrl}/tasks` });
});

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
}

function flashBadge(text, color) {
  setBadge(text, color);
  setTimeout(() => setBadge(""), 4000);
}

async function pushHistory(entry) {
  const { history = [] } = await chrome.storage.local.get("history");
  history.unshift({ at: new Date().toISOString(), ...entry });
  await chrome.storage.local.set({ history: history.slice(0, HISTORY_SIZE) });
}

/** `info.selectionText` collapses line breaks; read the live selection to keep bullet lists intact. */
async function readSelection(tab, info) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
      func: () => (window.getSelection ? window.getSelection().toString() : ""),
    });
    const text = (res && res.result) || "";
    if (text.trim()) return text;
  } catch (err) {
    console.warn("WorkBrief: could not read selection via scripting, falling back.", err);
  }
  return info.selectionText || "";
}

function describeHttpError(status, body) {
  const serverMsg = body && body.message;
  if (status === 401) return serverMsg || "Webhook key không hợp lệ. Kiểm tra lại key trong popup.";
  if (status === 403) return serverMsg || "Tài khoản bị khóa hoặc đã hết hạn dùng thử.";
  if (status === 429) return serverMsg || "Bạn đã dùng hết lượt AI.";
  if (status === 400) return serverMsg || "Nội dung tin nhắn không hợp lệ.";
  return serverMsg || `Máy chủ trả về lỗi ${status}.`;
}

/* ------------------------------------------------------------ Send -- */

async function sendToWorkBrief(rawText) {
  const settings = await getSettings();
  if (!settings.webhookKey) {
    notify("Chưa cấu hình WorkBrief AI", "Hãy dán x-webhook-key (lấy ở trang Gmail & Zalo trên web) vào popup của extension.", {
      isError: true,
    });
    chrome.runtime.openOptionsPage();
    return;
  }

  const message = rawText.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_LENGTH);
  if (message.length < MIN_LENGTH) {
    notify("Tin nhắn quá ngắn", `Hãy bôi đen ít nhất ${MIN_LENGTH} ký tự nội dung công việc.`, { isError: true });
    return;
  }

  await setBadge("…", "#6366f1");
  try {
    const res = await fetch(settings.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-key": settings.webhookKey },
      body: JSON.stringify({ message, sentAt: new Date().toISOString() }),
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON response */
    }

    if (!res.ok || !body || !body.success) {
      const error = describeHttpError(res.status, body);
      await pushHistory({ ok: false, error, preview: message.slice(0, 80) });
      flashBadge("!", "#e11d48");
      notify("Không tạo được công việc", error, { isError: true });
      return;
    }

    const task = body.data.task;
    const quota = body.data.quota;
    await pushHistory({ ok: true, title: task.title, priority: task.priority, isMock: !!body.data.isMock });
    flashBadge("✓", "#059669");
    notify(
      "Đã tạo công việc trong WorkBrief AI",
      `${task.title}${quota ? `\nCòn ${quota.remaining} lượt AI · bấm để mở danh sách công việc` : ""}`,
    );
  } catch (err) {
    const error = `Không kết nối được ${settings.apiUrl}. Backend đã chạy chưa? (${err && err.message ? err.message : err})`;
    await pushHistory({ ok: false, error, preview: message.slice(0, 80) });
    flashBadge("!", "#e11d48");
    notify("Lỗi kết nối", error, { isError: true });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || tab.id === undefined) return;
  const text = await readSelection(tab, info);
  await sendToWorkBrief(text);
});
