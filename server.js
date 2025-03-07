const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const unorm = require('unorm');
const app = express();
const Notification = require('./modelnotification')
app.use(express.json());
app.use(cors());
const PORT = 4000;
const JWT_SECRET = 'your_secret_key';
const MONGO_URI = 'mongodb+srv://timphongtro:123@cluster0.b2ejg.mongodb.net/TimtroDB?retryWrites=true&w=majority&appName=Cluster0';
const admin = require("firebase-admin");
// const serviceAccount = require("./serviceAccountKey.json");
require('dotenv').config();
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);
const email = JSON.parse(process.env.EMAIL_USER);
const pass = JSON.parse(process.env.EMAIL_PASS);
// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: 'dzf6e19it',
  api_key: '793931512479775',
  api_secret: 'ta61752Axgu0qiGkgFKiNnjDqwI',
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Cấu hình gửi email bằng Gmail
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user:email,
    pass:pass,
  },
});



// Kết nối MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Failed to connect to MongoDB:', err));

// mongoose
// .connect(MONGO_URI)
// .then(async () => {
//   try {
//     // Chỉ cập nhật các bản ghi có `price` là chuỗi
//     const result = await Post.updateMany(
//       { price: { $type: "string" } },  // Chỉ chọn các bản ghi có price là chuỗi
//       [{
//         $set: { 
//           price: {
//             $toInt: { $replaceAll: { input: "$price", find: ",", replacement: "" } } // Loại bỏ dấu phẩy
//           }
//         }
//       }] // Chuyển đổi từ chuỗi sang số
//     );

//     console.log(`✅ Đã cập nhật ${result.modifiedCount} bản ghi.`);
//   } catch (error) {
//     console.error("❌ Lỗi khi cập nhật price:", error);
//   }
// })
// .catch((err) => console.error('Failed to connect to MongoDB:', err));

// Model usersusers
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, },
  role: { type: String },
  phone: { type: String, required: true, unique: true },
  email: {type: String,required: true},
  password: { type: String, required: true },
  resetOtp: { type: String, default: null }, // Lưu OTP
  otpExpires: { type: Date, default: null }, // Lưu thời gian hết hạn OTP
  fcmToken: { type: String },

});
const User = mongoose.model('Users', UserSchema);

const CommentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  rate: { type: Number, required: false },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  parentId: { type: mongoose.Schema.Types.ObjectId, default: null }, // Thêm parentId
});

const PostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  price: { type: String, required: true },
  roomnull: { type: String, required: true },
  utilities: { type: [String], required: true },
  roomarea: { type: String, required: true },
  description: { type: String, required: true },
  contactName: { type: String, required: true },
  contactPhone: { type: String, required: true },
  images: { type: [String], default: [] },
  address: {
    city: String,
    district: String,
    ward: String,
    street: String,
  },
  userId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  totalRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  comments: [CommentSchema], // Nhúng schema bình luận
});



// Hàm cập nhật rating trung bình
PostSchema.methods.updateRating = function () {
  // Lọc chỉ những bình luận có rate hợp lệ (không undefined, không null, là số)
  const validComments = this.comments.filter(c => c.rate !== undefined && typeof c.rate === 'number');

  // Nếu không có bình luận hợp lệ, đặt totalRating = 0
  if (validComments.length === 0) {
    this.totalRating = 0;
    this.reviewCount = 0;
    return;
  }

  // Tính tổng rating từ các bình luận hợp lệ
  const total = validComments.reduce((sum, c) => sum + c.rate, 0);

  // Cập nhật tổng điểm rating trung bình
  this.totalRating = total / validComments.length;
  this.reviewCount = validComments.length;
};


const Post = mongoose.model('Posts', PostSchema);
module.exports = Post;


//// đăng bài
app.post('/posts', async (req, res) => {
  const { type, title, price, roomnull, utilities, roomarea, description, contactName, contactPhone, images, address, userId, comments } = req.body;

  if (!type || !title || !price || !roomnull || !utilities || !roomarea || !description || !contactName || !contactPhone || !images || !address || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Xử lý ảnh (base64 → Cloudinary hoặc giữ nguyên URL)
    const imageUrls = [];
    for (let image of images) {
      if (image.startsWith('data:image/')) {
        const result = await cloudinary.uploader.upload(image, { resource_type: 'auto' });
        imageUrls.push(result.secure_url);
      } else {
        imageUrls.push(image);
      }
    }

    // Khởi tạo bài viết mới
    const newPost = new Post({
      type,
      title,
      price,
      roomnull,
      utilities,
      roomarea,
      description,
      contactName,
      contactPhone,
      images: imageUrls,
      address,
      userId,
      comments: [], // Khởi tạo rỗng trước khi thêm
    });

    // Nếu có bình luận, thêm vào post
    if (comments && Array.isArray(comments)) {
      comments.forEach(comment => {
        if (comment.userId && comment.name && comment.rate !== undefined && comment.text) {
          newPost.comments.push({
            userId: comment.userId,
            name: comment.name,
            rate: comment.rate,
            text: comment.text,
            createdAt: comment.createdAt || new Date(),
          });
        }
      });
      newPost.updateRating(); // Cập nhật tổng rating sau khi thêm bình luận
    }

    await newPost.save();

    res.status(201).json({
      message: 'Post created successfully',
      post: newPost,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', details: err });
  }
});

/// api nhập email đêr lấy lại mật khẩu
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    // Kiểm tra email có tồn tại không
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Email không tồn tại trong hệ thống!' });
    }

    // Tạo mã OTP 6 số ngẫu nhiên
    const otpCode = crypto.randomInt(100000, 999999).toString();

    // Lưu OTP vào database
    user.resetOtp = otpCode;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // OTP hết hạn sau 5 phút
    await user.save();

    // Giao diện HTML của email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: auto; border: 1px solid #ddd; border-radius: 10px;">
        <h3 style="color: #333;">Xin chào, ${user.name || 'bạn'}</h3>
        <p style="font-size: 16px;">Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu của bạn.</p>
        <p style="font-size: 16px;">Nhập mã đặt lại mật khẩu sau đây:</p>
        <div style="text-align: center; margin: 20px 0;">
          <span style="
            font-size: 24px;
            font-weight: bold;
            display: inline-block;
            background: #e8f0fe;
            padding: 15px 25px;
            border-radius: 8px;
            border: 1px solid #4c8bf5;
            color: #1a73e8;
          ">${otpCode}</span>
        </div>
        <p style="font-size: 14px; color: #555;">Mã OTP này có hiệu lực trong <strong>5 phút</strong>.</p>
        <p style="font-size: 14px; color: #555;">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
      </div>
    `;

    // Gửi email
    const mailOptions = {
      from: 'otpflutter9@gmail.com',
      to: email,
      subject: 'Mã OTP đặt lại mật khẩu',
      html: emailHtml, // Sử dụng HTML thay vì text
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: 'Mã OTP đã được gửi đến email của bạn!' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi gửi email OTP!' });
  }
});


/// api nhập mã xác thực otpotp
app.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Kiểm tra email có tồn tại không
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Email không tồn tại!' });
    }

    // Kiểm tra OTP có đúng không
    if (user.resetOtp !== otp) {
      return res.status(400).json({ error: 'OTP không chính xác!' });
    }

    // Kiểm tra OTP có hết hạn không
    if (Date.now() > user.otpExpires) {
      return res.status(400).json({ error: 'OTP đã hết hạn!' });
    }

    res.json({ message: 'OTP hợp lệ. Bạn có thể đặt lại mật khẩu!' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi xác minh OTP!' });
  }
});

/// api đặt lại mật khẩu
app.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    // Kiểm tra email có tồn tại không
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Email không tồn tại!' });
    }

    // Kiểm tra OTP có đúng không
    if (user.resetOtp !== otp) {
      return res.status(400).json({ error: 'OTP không hợp lệ!' });
    }

    // Kiểm tra OTP có hết hạn không
    if (Date.now() > user.otpExpires) {
      return res.status(400).json({ error: 'OTP đã hết hạn!' });
    }

    // Mã hóa mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Xóa OTP sau khi đặt lại mật khẩu thành công
    user.resetOtp = null;
    user.otpExpires = null;
    await user.save();

    res.json({ message: 'Đặt lại mật khẩu thành công!' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi đặt lại mật khẩu!' });
  }
});


// Kiểm tra API hoạt động
app.get('/', (req, res) => {
  res.send('Server is running!');
});

/// API dang ky
app.post('/register', async (req, res) => {
  const { name, phone, email, password } = req.body;

  if (!name || !phone || !email || !password) {
    return res.status(400).json({ error: 'Missing name, phone, email, or password.' });
  }

  try {
    // Kiểm tra số điện thoại đã tồn tại chưa
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ error: 'Số điện thoại đã được đăng ký. Vui lòng chọn số khác.' });
    }

    // Kiểm tra email đã tồn tại chưa
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email đã được đăng ký. Vui lòng chọn email khác.' });
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // Tạo mới người dùng và lưu vào cơ sở dữ liệu
    const newUser = new User({ name, phone, email, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.', details: err });
  }
});


// API đăng nhập
app.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  // Kiểm tra đầu vào từ client
  if (!phone || !password) {
    return res.status(400).json({ error: 'Nhập đầy đủ thông tin' });
  }

  try {
    // Tìm người dùng dựa trên username
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ error: 'Số điện thoại không đúng' });
    }

    // Kiểm tra mật khẩu
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Sai mật khẩu ' });
    }

    // Tạo token JWT
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });

    // Trả về thông tin người dùng và token
    res.status(200).json({
      token,
      message: 'Đăng nhập thành công',
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role  // Trả về số điện thoại
      },
    });
  } catch (err) {
    console.error(err); // Ghi log lỗi để dễ debug
    res.status(500).json({ error: 'Internal server error.' });
  }
});


//// API thêm vai trò cho người dùng
app.post('/update-role', async (req, res) => {
  const { userId, role } = req.body;
  if (!userId || !role) {
    return res.status(400).json({ error: 'Thiếu thông tin người dùng hoặc vai trò.' });
  }

  try {
    const result = await User.updateOne(
      { _id: userId },
      { $set: { role } }
    );
    res.status(200).json({ message: 'Cập nhật vai trò thành công.' });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi cập nhật vai trò.' });
  }
});

/// API lấy bai dang
app.get('/posts', async (req, res) => {
  try {
    const posts = await Post.find(); // Lấy tất cả bài đăng
    if (!posts.length) {
      return res.status(404).json({ message: 'Không có bài đăng nào' });
    }
    res.json(posts); // Trả về danh sách bài đăng
  } catch (err) {
    console.error('Lỗi truy vấn MongoDB:', err);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi truy vấn dữ liệu' });
  }
});


/// api lấy bài đăng theo id
app.get('/posts/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Kiểm tra ID có hợp lệ hay không
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID không hợp lệ' });
    }

    // Tìm bài đăng theo ID
    const post = await Post.findById(id); // Không cần chuyển đổi thêm vì đã kiểm tra isValid
    if (!post) {
      return res.status(404).json({ message: 'Không tìm thấy bài đăng với ID này' });
    }

    // Trả về bài đăng nếu tìm thấy
    res.status(200).json(post);
  } catch (err) {
    console.error('Lỗi truy vấn MongoDB:', err);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi truy vấn dữ liệu từ cơ sở dữ liệu' });
  }
});



// Cấu hình Multer để xử lý upload ảnh
const storage = multer.memoryStorage();
const upload = multer({ storage });

// API tải ảnh lên Cloudinary và trả về URL
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'auto'
    });

    // Trả về URL của ảnh đã upload
    res.status(200).json({
      message: 'Upload thành công',
      imageUrl: result.secure_url,  // Trả về URL ảnh từ Cloudinary
    });
  } catch (error) {
    console.error('Lỗi khi upload ảnh:', error);
    res.status(500).json({ error: 'Không thể upload ảnh' });
  }
});

// API lấy các bài đăng của người dùng theo userId
app.get('/posts/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Tìm tất cả các bài đăng có userId trùng khớp, sắp xếp theo thời gian tạo mới nhất
    const posts = await Post.find({ userId }).sort({ createdAt: -1 });

    if (posts.length === 0) {
      return res.status(404).json({ message: 'Không có bài đăng nào của người dùng này' });
    }

    res.status(200).json(posts); // Trả về các bài đăng của người dùng, mới nhất lên đầu
  } catch (err) {
    console.error('Lỗi khi truy vấn bài đăng:', err);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi truy vấn bài đăng của người dùng' });
  }
});



/// API xóa bài đã đăngđăng
app.delete('/posts/:postId', async (req, res) => {
  const postId = req.params.postId;
  console.log("Xóa bài đăng với postId: ", postId);  // In ra postId nhận được

  try {
    // Sử dụng Model Post để xóa bài đăng
    const result = await Post.deleteOne({ _id: postId }); // Sử dụng _id thay vì postId

    if (result.deletedCount === 1) {
      res.status(200).send({ message: 'Bài đăng đã được xóa thành công' });
    } else {
      res.status(404).send({ message: 'Bài đăng không tìm thấy' });
    }
  } catch (err) {
    console.log('Lỗi khi xóa bài đăng:', err);  // In log lỗi chi tiết
    res.status(500).send({ message: 'Lỗi server', error: err });
  }
});



//// API sửa bài đăng
app.put('/posts/:postId', async (req, res) => {
  const postId = req.params.postId;
  const { title, price, roomnull, utilities, roomarea, description, contactName, contactPhone, images, address } = req.body;

  // Kiểm tra xem các trường cần thiết có được gửi hay không
  if (!title || !price || !roomnull || !utilities || !roomarea || !description || !contactName || !contactPhone || !images || !address) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Nếu có ảnh, thay thế đường dẫn cục bộ bằng URL từ Cloudinary
    const imageUrls = [];
    for (let image of images) {
      if (image.startsWith('data:image/')) {
        // Nếu là ảnh base64, bạn cần upload lên Cloudinary để lấy URL
        const result = await cloudinary.uploader.upload(image, { resource_type: 'auto' });
        imageUrls.push(result.secure_url);
      } else {
        imageUrls.push(image); // Nếu là URL đã có, chỉ cần thêm vào mảng
      }
    }

    // Sử dụng `findByIdAndUpdate` để cập nhật bài đăng
    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      {
        title,
        price,
        roomnull,
        utilities,
        roomarea,
        description,
        contactName,
        contactPhone,
        images: imageUrls,  // Lưu danh sách URL ảnh
        address
      },
      { new: true }  // Trả về bài đăng đã cập nhật
    );

    if (!updatedPost) {
      return res.status(404).json({ message: 'Bài đăng không tìm thấy' });
    }

    // Trả về bài đăng đã sửa
    res.status(200).json({ message: 'Bài đăng đã được sửa thành công', post: updatedPost });

  } catch (err) {
    console.error('Lỗi khi sửa bài đăng:', err);
    res.status(500).json({ error: 'Lỗi server', details: err });
  }
});



/// model favourite
const FavouriteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  favourites: [
    {
      postId: { type: String, required: true },
      savedAt: { type: Date, default: Date.now }, // Thời gian lưu bài viết
    },
  ],
});

module.exports = mongoose.model('Favourite', FavouriteSchema);




//// API lưu vào yêu thích 
const Favourite = mongoose.model('Favourite', FavouriteSchema);

app.post('/favourites', async (req, res) => {
  const { userId, postId } = req.body;
  try {
    // Kiểm tra xem userId có được gửi lên không
    if (!userId) {
      return res.status(400).json({ message: 'Thiếu userId trong yêu cầu.' });
    }
    let userFavourites = await Favourite.findOne({ userId });
    // Nếu chưa tồn tại danh sách yêu thích, tạo mới
    if (!userFavourites) {
      userFavourites = new Favourite({ userId, favourites: [] });
    }

    // Kiểm tra nếu bài viết đã tồn tại trong danh sách yêu thích
    const existingIndex = userFavourites.favourites.findIndex(
      (fav) => fav.postId === postId
    );

    if (existingIndex !== -1) {
      // Nếu bài viết đã tồn tại, xóa khỏi danh sách yêu thích
      userFavourites.favourites.splice(existingIndex, 1);
      await userFavourites.save();

      return res
        .status(200)
        .json({ message: 'Đã xóa khỏi danh sách yêu thích.' });
    }

    // Nếu bài viết chưa tồn tại, thêm vào danh sách yêu thích
    userFavourites.favourites.push({ postId });
    await userFavourites.save();

    res.status(200).json({ message: 'Đã lưu vào danh sách yêu thích.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});


/// api lấy bài đăng đã lưu
app.get('/favourites/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Tìm danh sách yêu thích của người dùng
    const userFavourites = await Favourite.findOne({ userId });

    if (!userFavourites) {
      return res.status(404).json({ message: 'Không tìm thấy danh sách yêu thích' });
    }

    // Lấy thông tin bài viết từ bảng posts dựa trên postId trong danh sách yêu thích
    const postIds = userFavourites.favourites.map(fav => fav.postId);
    const posts = await Post.find({ '_id': { $in: postIds } });

    // Kết hợp thông tin từ favourites và posts
    const favouriteWithDetails = userFavourites.favourites.map(fav => {
      const post = posts.find(post => post._id.toString() === fav.postId);
      return {
        postId: fav.postId,
        images: post?.images,
        price: post?.price,
        address: post?.address,
        roomarea: post?.roomarea, // Lấy thêm diện tích phòng
      };
    });

    res.status(200).json(favouriteWithDetails);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});


/// api cập nhật thông tin
app.post('/update-profile/:userId', async (req, res) => {
  const { userId } = req.params;
  const { name, phone } = req.body;
  console.log('Received data:', { userId, name, phone });

  // Kiểm tra thông tin có đầy đủ không
  if (!userId || !name || !phone) {
    console.log('Missing information');
    return res.status(400).json({ message: 'Thông tin không đầy đủ!' });
  }

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { name: name, phone: phone },
      { new: true }
    );

    if (!user) {
      console.log('User not found');
      return res.status(404).json({ message: 'Người dùng không tồn tại!' });
    }

    console.log('User updated successfully');
    return res.status(200).json({ message: 'Cập nhật thành công!' });
  } catch (error) {
    console.error('Error in server:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ, vui lòng thử lại!' });
  }
});


///API thay đổi mật khẩu
app.post('/change-password', async (req, res) => {

  const { userId, oldPassword, newPassword } = req.body;
  console.log('Received request to change password');
  console.log('Request body:', req.body);

  try {
    // Tìm người dùng theo userId
    const user = await User.findById(userId);

    // Kiểm tra mật khẩu cũ có đúng không
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Mật khẩu cũ không đúng' });
    }

    // Mã hóa mật khẩu mới
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Cập nhật mật khẩu mới vào cơ sở dữ liệu
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ msg: 'Đổi mật khẩu thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Có lỗi xảy ra' });
  }
});

/// api timf kiếm
app.post('/search', async (req, res) => {
  try {
    const { query } = req.body;

    // Log để kiểm tra giá trị query
    console.log('Query received:', query);

    if (!query) {
      return res.status(400).json({ error: 'Missing required field: query' });
    }

    // Loại bỏ dấu tiếng Việt và chuẩn hóa truy vấn
    const queryNoAccent = unorm.nfd(query).replace(/[\u0300-\u036f]/g, "").toLowerCase();
    console.log('Query no accent:', queryNoAccent);

    // Chia nhỏ từ khóa thành các phần
    const queryParts = query.split(/\s+/).map(part => part.trim()).filter(Boolean);
    const queryPartsNoAccent = queryNoAccent.split(/\s+/).map(part => part.trim()).filter(Boolean);

    console.log('Query parts:', queryParts);
    console.log('Query parts no accent:', queryPartsNoAccent);

    // Khởi tạo bộ lọc MongoDB
    let filter = { $and: [] };

    // Thêm điều kiện tìm kiếm với `$regex` cho từng từ khóa
    queryParts.forEach((part, index) => {
      const partNoAccent = queryPartsNoAccent[index];

      filter.$and.push({
        $or: [
          { title: { $regex: part, $options: 'i' } }, // Tìm kiếm có dấu
          { title: { $regex: partNoAccent, $options: 'i' } }, // Tìm kiếm không dấu
          { 'address.city': { $regex: part, $options: 'i' } },
          { 'address.city': { $regex: partNoAccent, $options: 'i' } },
          { 'address.district': { $regex: part, $options: 'i' } },
          { 'address.district': { $regex: partNoAccent, $options: 'i' } },
          { 'address.ward': { $regex: part, $options: 'i' } },
          { 'address.ward': { $regex: partNoAccent, $options: 'i' } },
          { 'address.street': { $regex: part, $options: 'i' } },
          { 'address.street': { $regex: partNoAccent, $options: 'i' } }
        ]
      });
    });

    console.log('Final filter:', JSON.stringify(filter, null, 2));

    // Thực hiện tìm kiếm
    const posts = await Post.find(filter);

    res.status(200).json(posts);
  } catch (err) {
    console.error('Error during fetching posts:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});


///// model lưu từ khóa tì kiếm
const Schema = mongoose.Schema;
const searchHistorySchema = new Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Tham chiếu đến user
  keywords: [String], // Mảng chứa các từ khóa tìm kiếm
  createdAt: { type: Date, default: Date.now }, // Ngày tạo
});

const SearchHistory = mongoose.model('SearchHistory', searchHistorySchema);
module.exports = SearchHistory;


/// API lưu từ khóa tìm kiếm
app.post('/save-keyword', async (req, res) => {
  const { query, userId, deleteQuery } = req.body;  // 'deleteQuery' là từ khóa muốn xóa (nếu có)

  // Kiểm tra dữ liệu đầu vào
  if (!userId) {
    console.error('Missing userId');
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
    // Kiểm tra userId có phải là ObjectId hợp lệ không
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error('Invalid userId:', userId);
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    // Tìm kiếm lịch sử tìm kiếm của người dùng
    const existingHistory = await SearchHistory.findOne({ userId: new mongoose.Types.ObjectId(userId) });

    if (existingHistory) {
      // Nếu yêu cầu xóa từ khóa
      if (deleteQuery) {
        // Loại bỏ từ khóa muốn xóa nếu có
        const index = existingHistory.keywords.indexOf(deleteQuery);
        if (index !== -1) {
          existingHistory.keywords.splice(index, 1);
          console.log('Keyword deleted from search history');
        }
      } else {
        // Kiểm tra xem từ khóa đã tồn tại trong lịch sử tìm kiếm chưa
        const index = existingHistory.keywords.indexOf(query);
        if (index !== -1) {
          // Nếu từ khóa đã tồn tại, loại bỏ từ khóa cũ
          existingHistory.keywords.splice(index, 1);
        }
        // Thêm từ khóa mới vào đầu mảng
        existingHistory.keywords.unshift(query);
        // Nếu có hơn 10 từ khóa, loại bỏ từ khóa cũ nhất
        if (existingHistory.keywords.length > 10) {
          existingHistory.keywords.pop(); // Loại bỏ từ khóa cuối cùng
        }
      }
      await existingHistory.save();
      console.log('Search history updated');
    } else {
      // Nếu chưa có lịch sử, tạo mới tài liệu
      const newHistory = new SearchHistory({
        userId: new mongoose.Types.ObjectId(userId), // Sử dụng 'new' để khởi tạo ObjectId
        keywords: [query], // Tạo mảng chứa từ khóa
      });
      await newHistory.save();
      console.log('New search history created');
    }

    return res.status(200).json({ message: 'Search history updated successfully' });
  } catch (err) {
    console.error('Error saving keyword:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});


/// api lay tu khoa tim kiem 
app.get('/get-search-history', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
    // Lấy lịch sử tìm kiếm của người dùng
    const history = await SearchHistory.findOne({ userId: new mongoose.Types.ObjectId(userId) });

    if (history) {
      return res.status(200).json(history.keywords); // Trả về mảng từ khóa
    } else {
      return res.status(404).json({ error: 'No search history found' });
    }
  } catch (err) {
    console.error('Error fetching search history:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/// model đặt xem phòng
const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestuserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  viewDate: { type: String, required: true },
  viewTime: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  isReview: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const Booking = mongoose.model('Booking', bookingSchema);

// API để tạo booking
app.post('/booking', async (req, res) => {
  const { userId, requestuserId, postId, name, phone, viewDate, viewTime, isReview } = req.body;

  try {
    if (!viewDate || !viewTime) {
      return res.status(400).send({ message: 'viewDate and viewTime are required.' });
    }

    const booking = new Booking({
      userId,
      requestuserId,
      postId,
      name,
      phone,
      viewDate,
      viewTime,
      isReview
    });

    await booking.save();

    const landlord = await User.findById(userId); // Tìm chủ trọ
    if (landlord) {
      // Lưu thông báo vào MongoDB
      const notification = new Notification({
        userId: landlord._id, // Chủ trọ là người nhận thông báo
        title: "Yêu cầu đặt xem phòng mới",
        body: `${name} đã yêu cầu xem phòng vào ${viewDate} lúc ${viewTime}.`,
        type: "pending"
      });

      await notification.save();

      console.log("✅ Thông báo đã được lưu vào MongoDB:", notification);

      // Gửi thông báo đến Firebase nếu có token
      if (landlord.fcmToken) {
        const message = {
          token: landlord.fcmToken,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: {
            role: "owner"
          },
        };

        try {
          const response = await admin.messaging().send(message);
          console.log("✅ Thông báo đã gửi thành công:", response);
        } catch (error) {
          console.error("❌ Lỗi khi gửi thông báo:", error);
        }
      }
    } else {
      console.log("⚠️ Chủ trọ không tồn tại.");
    }

    res.status(200).send({ message: 'Booking request sent successfully!', booking });
  } catch (error) {
    res.status(500).send({ message: 'Error creating booking request', error });
  }
});


/// api lấy thông báo
app.get('/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });

    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching notifications', error });
  }
});

/// api xóa thông báo
app.delete('/notifications/delete/:notificationId', async (req, res) => {
  try {
    const { notificationId } = req.params;
    await Notification.findByIdAndDelete(notificationId);
    res.status(200).json({ message: "Thông báo đã xóa thành công" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi xóa thông báo", error });
  }
});


app.post('/update-fcm-token', async (req, res) => {
  const { userId, fcmToken } = req.body;

  if (!userId || !fcmToken) {
    return res.status(400).send({ message: 'UserId và fcmToken là bắt buộc' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ message: 'Không tìm thấy user' });
    }

    user.fcmToken = fcmToken;
    await user.save();

    console.log("✅ FCM Token đã được cập nhật:", fcmToken);
    res.status(200).send({ message: 'FCM Token updated successfully!' });
  } catch (error) {
    console.error("❌ Lỗi khi cập nhật FCM Token:", error);
    res.status(500).send({ message: 'Lỗi khi cập nhật FCM Token', error });
  }
});




// API để xác nhận đặt xem phòng
app.post('/bookings/:bookingId/viewed', async (req, res) => {
  const { bookingId } = req.params;

  try {
    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: 'viewed' },
      { new: true }
    );

    if (!booking) {
      return res.status(404).send({ message: 'Booking not found' });
    }

    const tenant = await User.findById(booking.requestuserId);
    if (!tenant) {
      return res.status(400).send({ message: 'Tenant not found' });
    }

    // 1️⃣ Lưu thông báo vào MongoDB
    const notification = new Notification({
      userId: tenant._id,
      title: 'Bạn đã xem phòng!',
      body: 'Hãy để lại đánh giá để giúp người khác có thêm thông tin về phòng trọ.',
      type: 'viewed'
    });

    await notification.save();
    console.log("✅ Thông báo đánh giá đã lưu vào MongoDB:", notification);

    // 2️⃣ Gửi thông báo Firebase nếu có token
    if (tenant.fcmToken) {
      const message = {
        token: tenant.fcmToken,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          action: 'review_request',
          bookingId: bookingId,
        },
      };

      await admin.messaging().send(message);
      console.log("🔔 Đã gửi thông báo yêu cầu đánh giá");
    }

    res.status(200).send({ message: 'Booking marked as viewed!', booking });
  } catch (error) {
    console.error("🔥 Lỗi khi đánh dấu đã xem:", error);
    res.status(500).send({ message: 'Error marking booking as viewed', error });
  }
});


/// api xác nhận 
app.post('/bookings/:bookingId/approve', async (req, res) => {
  const { bookingId } = req.params;

  try {
    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: 'approved' },
      { new: true }
    );

    if (!booking) {
      return res.status(404).send({ message: "Booking not found" });
    }

    const tenant = await User.findById(booking.requestuserId);
    if (!tenant) {
      return res.status(400).send({ message: 'Tenant not found' });
    }

    // 1️⃣ Lưu thông báo vào MongoDB
    const notification = new Notification({
      userId: tenant._id, // Người thuê nhận thông báo
      title: "Xác nhận đặt lịch xem phòng",
      body: "Chủ trọ đã xác nhận yêu cầu đặt lịch xem phòng của bạn!",
      type: "approved"
    });

    await notification.save();
    console.log("✅ Thông báo xác nhận đã lưu vào MongoDB:", notification);

    // 2️⃣ Gửi thông báo Firebase nếu có token
    if (tenant.fcmToken) {
      const message = {
        token: tenant.fcmToken,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          action: 'booking_approved',
          bookingId: bookingId,
        },
      };

      await admin.messaging().send(message);
      console.log("🔔 Thông báo xác nhận đã gửi tới người thuê");
    }

    res.status(200).send({ message: 'Booking approved and notification sent', booking });
  } catch (error) {
    console.error('🔥 Lỗi gửi thông báo:', error);
    res.status(500).send({ message: 'Error approving booking', error });
  }
});




// API để từ chối cho xem phòng
app.post('/bookings/:bookingId/reject', async (req, res) => {
  const { bookingId } = req.params;

  try {
    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: 'rejected' },
      { new: true }
    );

    if (!booking) {
      return res.status(404).send({ message: 'Booking not found' });
    }

    const tenant = await User.findById(booking.requestuserId);
    if (!tenant) {
      return res.status(400).send({ message: 'Tenant not found' });
    }

    // 1️⃣ Lưu thông báo vào MongoDB
    const notification = new Notification({
      userId: tenant._id,
      title: 'Yêu cầu đặt xem phòng bị từ chối',
      body: 'Chủ phòng đã từ chối yêu cầu đặt xem phòng của bạn.',
      type: 'rejected'
    });

    await notification.save();
    console.log("✅ Thông báo từ chối đã lưu vào MongoDB:", notification);

    // 2️⃣ Gửi thông báo Firebase nếu có token
    if (tenant.fcmToken) {
      const message = {
        token: tenant.fcmToken,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          action: 'booking_rejected',
          bookingId: bookingId,
        },
      };

      await admin.messaging().send(message);
      console.log("🔔 Thông báo từ chối đã được gửi");
    }

    res.status(200).send({ message: 'Booking rejected and notification sent', booking });
  } catch (error) {
    console.error("🔥 Lỗi gửi thông báo:", error);
    res.status(500).send({ message: 'Error rejecting booking', error });
  }
});




/// API lấy phòng khách đã đặt
app.get('/bookings/user/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log('Received userId:', userId);  // Log userId nhận được từ client

  try {
    // Sắp xếp các booking theo trường createdAt từ mới nhất đến cũ nhất
    const bookings = await Booking.find({ userId: userId }).sort({ createdAt: -1 });

    if (bookings.length > 0) {
      res.status(200).send(bookings);  // Nếu có booking, trả về kết quả
    } else {
      res.status(200).send([]);  // Nếu không có, trả về mảng rỗng
    }
  } catch (error) {
    console.log('Error:', error);  // Log lỗi nếu có
    res.status(500).send({ message: 'Error fetching bookings', error });
  }
});

/// API  lấy phòng đã yêu cầu xem
app.get('/bookings/users/:requestuserId', async (req, res) => {
  const { requestuserId } = req.params;
  console.log('Received requestuserId:', requestuserId);  // Log requestuserId

  try {
    const objectId = new mongoose.Types.ObjectId(requestuserId); // Sử dụng new

    console.log('Converted ObjectId:', objectId);  // Log ObjectId để kiểm tra

    const bookings = await Booking.find({ requestuserId: objectId });

    if (bookings.length > 0) {
      res.status(200).send(bookings);  // Nếu có booking, trả về kết quả
    } else {
      res.status(200).send([]);  // Nếu không có, trả về mảng rỗng
    }
  } catch (error) {
    console.log('Error:', error);  // Log lỗi nếu có
    res.status(500).send({ message: 'Error fetching bookings', error });
  }
});

/// API bình luận 
app.post('/posts/:postId/comment', async (req, res) => {
  const { userId, bookingId, name, comment, rate, createdAt, parentId } = req.body;
  const postId = req.params.postId;

  // Kiểm tra đầu vào
  if (!userId || !bookingId || !name || !comment || !createdAt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const post = await Post.findById(postId).exec();
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Kiểm tra nếu parentId không hợp lệ
    if (parentId && !mongoose.Types.ObjectId.isValid(parentId)) {
      return res.status(400).json({ error: 'Invalid parentId' });
    }

    // Đảm bảo post.comments là một mảng
    if (!Array.isArray(post.comments)) {
      post.comments = [];
    }

    // Tạo bình luận mới
    const newComment = {
      userId,
      name,
      text: comment,
      createdAt,
      parentId: parentId || null,
    };

    // Chỉ thêm rate nếu nó tồn tại và là số hợp lệ
    if (rate !== undefined && typeof rate === 'number') {
      newComment.rate = rate;
    }


    post.comments.push(newComment);
    post.updateRating();
    await post.save();

    // Cập nhật trạng thái isReview = true trong Booking
    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId, // 🟢 Cập nhật bằng bookingId thay vì userId & postId
      { isReview: true },
      { new: true }
    );

    if (!updatedBooking) {
      console.log('Không tìm thấy Booking để cập nhật!');
    } else {
      console.log('Booking đã được cập nhật:', updatedBooking);
    }

    res.status(200).json({
      message: 'Comment added successfully',
      comment: newComment,
      totalRating: post.totalRating,
      reviewCount: post.reviewCount,
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});




// API hiện bình luận
app.get('/comments/:postId', async (req, res) => {
  try {
    const { postId } = req.params;

    // Kiểm tra ID hợp lệ
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ error: 'ID không hợp lệ' });
    }

    // Tìm bài viết theo ID và lấy danh sách bình luận
    const post = await Post.findById(postId);

    if (!post || !Array.isArray(post.comments) || post.comments.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy bình luận hoặc bài viết' });
    }

    res.status(200).json(post.comments); // Trả về mảng bình luận
  } catch (error) {
    console.error('Lỗi khi lấy bình luận:', error);
    res.status(500).json({ error: 'Không thể tải bình luận' });
  }
});


// Chạy server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
