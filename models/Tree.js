const mongoose = require("mongoose");

const treeSchema = new mongoose.Schema({
  Adhar: {
    type: Number,
    required: true,
  },
  State: {
    type: String,
    required: true,
  },
  Distric: {
    type: String,
    required: true,
  },
  PinCode: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["Pending", "Verified", "Sold"],
    default: "Pending",
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }, // Buyer ya owner
  plantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }, // Original planter
});

module.exports = mongoose.model("Tree", treeSchema);
