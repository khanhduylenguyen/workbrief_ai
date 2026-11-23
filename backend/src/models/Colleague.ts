import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface IColleague {
  userId: Types.ObjectId;
  name: string;
  position: string;
  department: string;
  email: string;
  zaloPhone: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ColleagueDocument = HydratedDocument<IColleague>;

const colleagueSchema = new Schema<IColleague>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    position: { type: String, default: '', trim: true, maxlength: 120 },
    department: { type: String, default: '', trim: true, maxlength: 120 },
    email: { type: String, default: '', trim: true, lowercase: true, maxlength: 254 },
    zaloPhone: { type: String, default: '', trim: true, maxlength: 20 },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

colleagueSchema.index({ userId: 1, name: 1 });
colleagueSchema.index({ userId: 1, zaloPhone: 1 });

export const Colleague = model<IColleague>('Colleague', colleagueSchema);
