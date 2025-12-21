const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const multer = require("multer");
const ejsMate = require("ejs-mate");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const bcrypt = require("bcrypt");

const Tree = require("./models/Tree");
const User = require("./models/User");

const app = express();

// ================= DATABASE =================
mongoose.connect("mongodb://127.0.0.1:27017/greenex_db")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// ================= APP CONFIG =================
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ================= MULTER (IMAGE UPLOAD) =================
const storage = multer.diskStorage({
  destination: "public/uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

// ================= SESSION =================

app.use(
  session({
    name: "greenexchange",
    secret: "greenexchange_secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: "mongodb://127.0.0.1:27017/greenex_db",
      collectionName: "sessions",
    }),
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);


// ================= GLOBAL USER FOR VIEWS =================
app.use((req, res, next) => {
    res.locals.currentUser = req.session.userName || null;
    next();
});

// ================= ROUTES =================

// Home → Marketplace
app.get("/", async (req, res) => {
  const trees = await Tree.find({});
  res.render("trees/index", { trees });
});

// New Tree Form
app.get("/trees/new", (req, res) => {
  res.render("trees/new");
});

// Plant a Tree -- Save to DB
app.post("/trees", upload.single("image"), async (req, res) => {
    try {
        const { Adhar, State, Distric, PinCode, price } = req.body;
        const image = req.file ? "/uploads/" + req.file.filename : null;

        // Find user
        const user = await User.findById(req.session.userId);
        if (!user) return res.status(401).send("User not found");

        // Create new tree
        const newTree = await Tree.create({ 
            Adhar,
            State,
            Distric,
            PinCode,
            price,
            image,
            status: "Pending",      // By default Pending
            plantedBy: user._id
        });

        // Add tree to user's planted trees
        if (!user.trees) user.trees = [];
        user.trees.push(newTree._id);

        await user.save();

        // Redirect to profile so user can see their planted tree
        res.redirect("/profile");
    } catch (err) {
        console.error("Error planting tree:", err);
        res.status(500).send("Error while planting tree");
    }
});




// Tree Details
app.get("/trees/:id", async (req, res) => {
  const tree = await Tree.findById(req.params.id);
  res.render("trees/show", { tree });
});

// Resell Tree
app.post("/resell/:id", async (req, res) => {
  try {
    const tree = await Tree.findById(req.params.id);
    const user = await User.findById(req.session.userId);

    if (!tree) return res.send("Tree not found");

    // Buyer ke certificates se hatao
    user.certificates = user.certificates.filter(
      t => t.toString() !== tree._id.toString()
    );

    // Tree ko wapas marketplace me bhejo
    tree.status = "Verified";
    tree.owner = null;

    await tree.save();
    await user.save();

    res.redirect("/");
  } catch (err) {
    console.log(err);
    res.send("Error while reselling");
  }
});


// But Tree (secure logic)
app.post("/trees/:id/buy", async (req, res) => {
    try {
        const tree = await Tree.findById(req.params.id);
        if (tree.status !== "Verified") return res.send("Cannot buy this tree");

        // Status update
        tree.status = "Sold";
        await tree.save();

        // Buyer profile me certificate add
        const buyer = await User.findById(req.session.userId);
        if (!buyer.certificates) buyer.certificates = [];
        buyer.certificates.push(tree._id);
        await buyer.save();

        res.redirect("/profile");
    } catch (err) {
        console.log(err);
        res.send("Error while buying tree");
    }
});
// farmer- simulator ke liye
app.get("/farmer-simulator", (req, res) => {
  res.render("page/farmer-simulator", {
    currentUser: req.session.user
  });
});




// Team members details

app.get("/team", (req, res) => {
  res.render("page/team");
});

// about page ke liye

app.get("/about", (req, res) => {
  res.render("page/about");
});

app.get("/stats", (req, res) => {
  res.render("page/stats");
});








// CERTIFICATE PDF DOWNLOAD
const PDFDocument = require("pdfkit");

app.get("/certificate/:id/download", async (req, res) => {
  try {
    const tree = await Tree.findById(req.params.id);
    if (!tree) return res.send("Certificate not found");

    const doc = new PDFDocument();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Tree-Certificate-${tree._id}.pdf`
    );

    doc.pipe(res);

    doc.fontSize(20).text("🌳 Tree Plantation Certificate", { align: "center" });
    doc.moveDown();

    doc.fontSize(14).text(`Location: ${tree.State}, ${tree.Distric}`);
    doc.text(`Price: ₹${tree.price}`);
    doc.text(`Status: ${tree.status}`);
    doc.text(`Certificate ID: ${tree._id}`);

    doc.moveDown();
    doc.text("This certificate verifies the plantation and ownership of the tree.");

    doc.end();
  } catch (err) {
    console.log(err);
    res.send("Error generating certificate");
  }
});




// About page
app.get("/about", (req, res) => {
  res.render("about");
});

// Stats page
app.get("/stats", async (req, res) => {
  const totalTrees = await Tree.countDocuments();
  const totalUsers = await User.countDocuments();
  res.render("stats", { totalTrees, totalUsers });
});

// Profile page
app.get("/profile", async (req, res) => {
    if (!req.session.userId) return res.redirect("/login");

    const user = await User.findById(req.session.userId).populate("certificates");
    res.render("profile", { user });
});


// ================= AUTH ROUTES =================

// Signup

app.get("/signup", (req, res) => res.render("auth/signup"));
app.post("/signup", async (req, res) => {
  try {
    console.log("BODY:", req.body);

    const user = await User.create(req.body);

    res.send("Signup success");
  } catch (err) {
    console.log("SIGNUP ERROR 👉", err);
    res.send(err.message);
  }
});

// app.get("/signup", (req, res) => res.render("auth/signup"));
// app.post("/signup", async (req, res) => {
//   try {
//     const { name, email, password } = req.body;

//     const user = await User.create({
//       name,
//       email,
//       password   // ❗ plain password
//     });

//     req.session.userId = user._id;
//     req.session.userName = user.name;

//     res.redirect("/");
//   } catch (err) {
//     console.log(err);

//     if (err.code === 11000) {
//       return res.send("Email already registered");
//     }

//     res.send("Signup failed");
//   }
// });


// Login
app.get("/login", (req, res) => res.render("auth/login"));
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.send("Invalid email or password");

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.send("Invalid email or password");

  req.session.userId = user._id;
  req.session.userName = user.name;
  res.redirect("/");
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) console.log(err);
    res.redirect("/");
  });
});

// ================= SERVER =================
app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});


// const express = require("express");
// const mongoose = require("mongoose");
// const path = require("path");
// const multer = require("multer");

// const Tree = require("./models/Tree");

// const app = express();

// // ================= DATABASE =================
// mongoose.connect("mongodb://127.0.0.1:27017/greenex_db")
// .then(() => console.log("MongoDB Connected"))
// .catch(err => console.log(err));

// // ================= APP CONFIG =================
// app.set("view engine", "ejs");
// app.set("views", path.join(__dirname, "views"));

// // for ejs template
// const ejsMate = require("ejs-mate");
// app.engine("ejs", ejsMate);
// app.set("view engine", "ejs");


// app.use(express.urlencoded({ extended: true }));
// app.use(express.static(path.join(__dirname, "public")));

// // ================= MULTER (IMAGE UPLOAD) =================
// const storage = multer.diskStorage({
//   destination: "public/uploads",
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + "-" + file.originalname);
//   }
// });
// const upload = multer({ storage });

// // ================= ROUTES =================

// // Home → Marketplace
// /* Home Page – Show all trees */

// app.get("/", async (req, res) => {
//   const trees = await Tree.find({});
//   res.render("trees/index", { trees });
// });

// // Upload Form
// /* New Tree Form */
// app.get("/trees/new", (req, res) => {
//   res.render("trees/new");
// });

// /* Form Submit – Save to DB */
// app.post("/trees", upload.single("image"), async (req, res) => {
//     const { Adhar, State, Distric, PinCode, price } = req.body;
//     const image = "/uploads/" + req.file.filename;

//     await Tree.create({
//         Adhar,
//         State,
//         Distric,
//         PinCode,
//         price,
//         image
//     });

//     res.redirect("/");
// });




// // Home page right side part  

// // About page
// app.get("/about", (req, res) => {
//   res.render("about");
// });

// // Stats page
// app.get("/stats", async (req, res) => {
//   const totalTrees = await Tree.countDocuments();
//   const totalUsers = await User.countDocuments();
//   const totalCredits = totalTrees; // simple example
//   res.render("stats", { totalTrees, totalCredits, totalUsers });
// });

// // Profile page (example for logged-in user)
// app.get("/profile", async (req, res) => {
//   // req.user assume kiya hai login ke baad
//   const user = req.user; 
//   res.render("profile", { user });
// });



// // AI Verify Tree (Mock AI for Hackathon)
// // app.post("/trees/:id/verify", async (req, res) => {
// //   const tree = await Tree.findById(req.params.id);
// //   tree.status = "Verified";
// //   await tree.save();
// //   res.redirect(`/trees/${tree._id}`);
// // });


// // Tree Details
// app.get("/trees/:id", async (req, res) => {
//   const tree = await Tree.findById(req.params.id);
//   res.render("trees/show", { tree });
// });



// // login and signup form

// const bcrypt = require("bcrypt");
// const User = require("./models/User");

// // Signup
// app.get("/signup", (req, res) => res.render("signup"));
// app.post("/signup", async (req, res) => {
//   const { name, email, password } = req.body;
//   const user = new User({ name, email, password });
//   await user.save();
//   res.redirect("/login");
// });

// // Login
// app.get("/login", (req, res) => res.render("login"));
// app.post("/login", async (req, res) => {
//   const { email, password } = req.body;
//   const user = await User.findOne({ email });
//   if(user && await bcrypt.compare(password, user.password)){
//     // Simple session (req.user)
//     req.user = user;
//     res.redirect("/profile");
//   } else {
//     res.send("Invalid credentials");
//   }
// });

// // user login and signup authentication

// const session = require("express-session");
// const MongoStore = require("connect-mongo");

// app.use(session({
//     secret: "secret123",  // Random string
//     resave: false,
//     saveUninitialized: false,
//     store: MongoStore.create({ mongoUrl: "mongodb://127.0.0.1:27017/greenex_db" }),
//     cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 din
// }));

// // Logged in user ko har page me access ke liye
// app.use((req, res, next) => {
//     res.locals.currentUser = req.session.userId ? req.session.userName : null;
//     next();
// });

// //Signup Route

// // const User = require("./models/User");  nahi karrenge kyunki upar 117 line me already kar diya hai

// // Signup Form
// app.get("/signup", (req, res) => {
//     res.render("auth/signup");
// });

// // Signup POST
// app.post("/signup", async (req, res) => {
//     const { name, email, password } = req.body;
//     try {
//         const user = await User.create({ name, email, password });
//         req.session.userId = user._id;
//         req.session.userName = user.name;
//         res.redirect("/");
//     } catch (err) {
//         console.log(err);
//         res.send("Error in Signup. Maybe email already exists.");
//     }
// });

// //Login Route 

// // Login Form
// app.get("/login", (req, res) => {
//     res.render("auth/login");
// });

// // Login POST
// app.post("/login", async (req, res) => {
//     const { email, password } = req.body;
//     const user = await User.findOne({ email });
//     if (!user) return res.send("Invalid email or password");
    
//     const validPassword = await user.comparePassword(password);
//     if (!validPassword) return res.send("Invalid email or password");

//     req.session.userId = user._id;
//     req.session.userName = user.name;
//     res.redirect("/");
// });

// //Logout route

// app.post("/logout", (req, res) => {
//     req.session.destroy(err => {
//         if (err) console.log(err);
//         res.redirect("/");
//     });
// });



// // ================= SERVER =================
// app.listen(3000, () => {
//   console.log("Server running at http://localhost:3000");
// });
