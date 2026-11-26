import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export const GUIDE_INPUT_KINDS = ['manual', 'text', 'audio', 'image', 'pdf'] as const;
export type GuideInputKind = (typeof GUIDE_INPUT_KINDS)[number];

export interface IGuideStep {
  _id: Types.ObjectId;
  text: string;
  /** Extra detail for the step (where to click, which file, example values…). */
  detail: string;
}

export interface IGuideTodo {
  _id: Types.ObjectId;
  text: string;
  isDone: boolean;
  /** Task created from this to-do (via "Tạo việc"). */
  taskId: Types.ObjectId | null;
}

/** A how-to note: what someone showed the user, as ordered steps + tips + things to do. */
export interface IGuide {
  userId: Types.ObjectId;
  title: string;
  topic: string;
  /** Who taught it, free text ("anh Nam – kế toán"). */
  taughtBy: string;
  colleagueId: Types.ObjectId | null;
  summary: string;
  steps: Types.DocumentArray<IGuideStep>;
  tips: string[];
  todos: Types.DocumentArray<IGuideTodo>;
  /** Original note / transcript, kept so nothing is lost if AI misread something. */
  rawNote: string;
  inputKind: GuideInputKind;
  isMock: boolean;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type GuideDocument = HydratedDocument<IGuide>;

const stepSchema = new Schema<IGuideStep>({
  text: { type: String, required: true, trim: true, maxlength: 1_000 },
  detail: { type: String, default: '', trim: true, maxlength: 2_000 },
});

const todoSchema = new Schema<IGuideTodo>({
  text: { type: String, required: true, trim: true, maxlength: 500 },
  isDone: { type: Boolean, default: false },
  taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
});

const guideSchema = new Schema<IGuide>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    topic: { type: String, default: '', trim: true, maxlength: 80 },
    taughtBy: { type: String, default: '', trim: true, maxlength: 120 },
    colleagueId: { type: Schema.Types.ObjectId, ref: 'Colleague', default: null },
    summary: { type: String, default: '', maxlength: 3_000 },
    steps: { type: [stepSchema], default: [] },
    tips: { type: [{ type: String, trim: true, maxlength: 500 }], default: [] },
    todos: { type: [todoSchema], default: [] },
    rawNote: { type: String, default: '', maxlength: 30_000 },
    inputKind: { type: String, enum: GUIDE_INPUT_KINDS, default: 'manual' },
    isMock: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

guideSchema.index({ userId: 1, pinned: -1, updatedAt: -1 });
guideSchema.index({ userId: 1, topic: 1 });

export const Guide = model<IGuide>('Guide', guideSchema);
