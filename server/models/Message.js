import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    room: { type: String, required: true, index: true }, // the short roomId
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    text: { type: String, default: '', maxlength: 1000 },
    // Only the stored filename is saved. The client builds the URL from it.
    file: { name: String, filename: String },
  },
  { timestamps: true } // createdAt = message timestamp
);

export default mongoose.model('Message', messageSchema);
