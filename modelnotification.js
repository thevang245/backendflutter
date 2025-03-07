const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Người nhận thông báo
  title: { type: String, required: true }, // Tiêu đề thông báo
  body: { type: String, required: true },  // Nội dung thông báo
  type: {type: String},
  createdAt: { type: Date, default: Date.now } // Thời gian nhận thông báo
});

module.exports = mongoose.model('Notification', NotificationSchema);
