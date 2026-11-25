import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface ITeam {
  name: string;
  /** The leader is also a member. */
  leaderId: Types.ObjectId;
  memberIds: Types.ObjectId[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type TeamDocument = HydratedDocument<ITeam>;

const teamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    leaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

// A user belongs to at most one team (enforced in the service); this makes the lookup fast.
teamSchema.index({ memberIds: 1 });

export const Team = model<ITeam>('Team', teamSchema);
