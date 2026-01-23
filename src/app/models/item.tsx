import mongoose, { Schema, Document } from "mongoose";

export interface IItem extends Document {
  name: string;
  description?: string;
}

const ItemSchema: Schema<IItem> = new Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
});



export default mongoose.models.Item || mongoose.model<IItem>("Item", ItemSchema);
