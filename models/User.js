const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  trees: { 
    type: [mongoose.Schema.Types.ObjectId], 
    ref: "Tree", 
    default: [] },  
  // 🔥 VERY IMPORTANT
  certificates: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "Tree",
    default: [], // 👈 THIS FIXES YOUR ERROR
  },
  isAdmin: {
    type: Boolean,
    default: false
  }
});

// ✅ FIXED: async pre-save (NO next)
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const hash = await bcrypt.hash(this.password, 12);
  this.password = hash;
});

// Password compare method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
