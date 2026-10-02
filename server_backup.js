const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 5000;
const JWT_SECRET = process.env.JWT_SECRET || "food_business_secret";

// ================= DATABASE =================

mongoose
  .connect(
    process.env.MONGO_URI ||
      "mongodb://127.0.0.1:27017/food_business"
  )
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((error) => {
    console.log("MongoDB connection error:", error.message);
  });

// ================= MODELS =================

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["customer", "restaurant", "rider"],
      default: "customer",
    },
  },
  { timestamps: true }
);

const restaurantSchema = new mongoose.Schema(
  {
    ownerId: mongoose.Schema.Types.ObjectId,
    name: String,
    phone: String,
    address: String,
    image: String,
    isOpen: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const foodSchema = new mongoose.Schema(
  {
    restaurantId: mongoose.Schema.Types.ObjectId,
    name: String,
    description: String,
    category: String,
    price: Number,
    image: String,
    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const orderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    items: [
      {
        foodId: mongoose.Schema.Types.ObjectId,
        name: String,
        price: Number,
        quantity: Number,
      },
    ],

    subtotal: {
      type: Number,
      default: 0,
    },

    deliveryFee: {
      type: Number,
      default: 30,
    },

    totalAmount: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "placed",
        "accepted",
        "preparing",
        "rider_assigned",
        "picked_up",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "placed",
    },

    paymentMethod: {
      type: String,
      enum: ["cod", "upi", "card"],
      default: "cod",
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    deliveryAddress: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
const Restaurant = mongoose.model("Restaurant", restaurantSchema);
const Food = mongoose.model("Food", foodSchema);
const Order = mongoose.model("Order", orderSchema);

// ================= AUTH =================

function auth(req, res, next) {
  const header = req.headers.authorization || "";

  const token = header.startsWith("Bearer ")
    ? header.substring(7)
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Login required",
    });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

// ================= HOME =================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Food Business Backend is running",
  });
});

// ================= SIGNUP =================

app.post("/api/auth/signup", async (req, res) => {
  try {
    const {
      name,
      phone,
      password,
      role = "customer",
    } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, phone and password are required",
      });
    }

    if (!["customer", "restaurant", "rider"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid account role",
      });
    }

    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Phone number already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      phone,
      password: hashedPassword,
      role,
    });

    const token = jwt.sign(
      {
        id: user._id.toString(),
        role: user.role,
      },
      JWT_SECRET,
      {
        expiresIn: "30d",
      }
    );

    res.status(201).json({
      success: true,
      message: "Account created",
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ================= LOGIN =================

app.post("/api/auth/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone and password are required",
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone or password",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone or password",
      });
    }

    const token = jwt.sign(
      {
        id: user._id.toString(),
        role: user.role,
      },
      JWT_SECRET,
      {
        expiresIn: "30d",
      }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ================= CURRENT USER =================

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "-password"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ================= RESTAURANTS =================

// Create restaurant account/profile

app.post("/api/restaurants", auth, async (req, res) => {
  try {
    if (req.user.role !== "restaurant") {
      return res.status(403).json({
        success: false,
        message: "Restaurant account required",
      });
    }

    const existing = await Restaurant.findOne({
      ownerId: req.user.id,
    });

    if (existing) {
      return res.json({
        success: true,
        restaurant: existing,
      });
    }

    const restaurant = await Restaurant.create({
      ownerId: req.user.id,
      name: req.body.name || "My Restaurant",
      phone: req.body.phone || "",
      address: req.body.address || "",
      image: req.body.image || "",
    });

    res.status(201).json({
      success: true,
      restaurant,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// All restaurants

app.get("/api/restaurants", async (req, res) => {
  try {
    const restaurants = await Restaurant.find().sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      restaurants,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// My restaurant

app.get("/api/restaurants/my", auth, async (req, res) => {
  try {
    if (req.user.role !== "restaurant") {
      return res.status(403).json({
        success: false,
        message: "Restaurant account required",
      });
    }

    const restaurant = await Restaurant.findOne({
      ownerId: req.user.id,
    });

    res.json({
      success: true,
      restaurant,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ================= FOOD =================

// Add food

app.post("/api/foods", auth, async (req, res) => {
  try {
    if (req.user.role !== "restaurant") {
      return res.status(403).json({
        success: false,
        message: "Restaurant account required",
      });
    }

    const restaurant = await Restaurant.findOne({
      ownerId: req.user.id,
    });

    if (!restaurant) {
      return res.status(400).json({
        success: false,
        message: "Create restaurant profile first",
      });
    }

    if (!req.body.name || !req.body.price) {
      return res.status(400).json({
        success: false,
        message: "Food name and price are required",
      });
    }

    const food = await Food.create({
      restaurantId: restaurant._id,
      name: req.body.name,
      description: req.body.description || "",
      category: req.body.category || "Other",
      price: Number(req.body.price),
      image: req.body.image || "",
    });

    res.status(201).json({
      success: true,
      food,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// All available food

app.get("/api/foods", async (req, res) => {
  try {
    const foods = await Food.find({
      isAvailable: true,
    }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      foods,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// My restaurant food

app.get("/api/foods/my", auth, async (req, res) => {
  try {
    if (req.user.role !== "restaurant") {
      return res.status(403).json({
        success: false,
        message: "Restaurant account required",
      });
    }

    const restaurant = await Restaurant.findOne({
      ownerId: req.user.id,
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    const foods = await Food.find({
      restaurantId: restaurant._id,
    }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      foods,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ================= CUSTOMER ORDERS =================

// Place order

app.post("/api/orders", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Customer account required",
      });
    }

    const {
      restaurantId,
      items,
      totalAmount,
      subtotal,
      deliveryFee,
      paymentMethod,
      deliveryAddress,
    } = req.body;

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: "Restaurant is required",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    if (!deliveryAddress) {
      return res.status(400).json({
        success: false,
        message: "Delivery address is required",
      });
    }

    if (!["cod", "upi", "card"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    const restaurant = await Restaurant.findById(
      restaurantId
    );

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    const order = await Order.create({
      customerId: req.user.id,
      restaurantId,
      items,
      subtotal: Number(subtotal || 0),
      deliveryFee: Number(deliveryFee || 30),
      totalAmount: Number(totalAmount || 0),
      paymentMethod,
      paymentStatus: "pending",
      deliveryAddress,
      status: "placed",
    });

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Customer's orders

app.get("/api/orders/my", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Customer account required",
      });
    }

    const orders = await Order.find({
      customerId: req.user.id,
    }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ================= RESTAURANT ORDERS =================

// Restaurant receives its orders

app.get(
  "/api/orders/restaurant",
  auth,
  async (req, res) => {
    try {
      if (req.user.role !== "restaurant") {
        return res.status(403).json({
          success: false,
          message: "Restaurant account required",
        });
      }

      const restaurant = await Restaurant.findOne({
        ownerId: req.user.id,
      });

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: "Restaurant profile not found",
        });
      }

      const orders = await Order.find({
        restaurantId: restaurant._id,
      }).sort({
        createdAt: -1,
      });

      res.json({
        success: true,
        orders,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// ================= RIDER ORDERS =================

// Rider sees orders waiting for rider

app.get("/api/orders/rider", auth, async (req, res) => {
  try {
    if (req.user.role !== "rider") {
      return res.status(403).json({
        success: false,
        message: "Rider account required",
      });
    }

    const orders = await Order.find({
      $or: [
        {
          status: "rider_assigned",
          riderId: null,
        },
        {
          riderId: req.user.id,
        },
      ],
    }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ================= ORDER STATUS =================

app.patch(
  "/api/orders/:id/status",
  auth,
  async (req, res) => {
    try {
      const { status } = req.body;

      const allowedStatuses = [
        "accepted",
        "preparing",
        "rider_assigned",
        "picked_up",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order status",
        });
      }

      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // ---------- RESTAURANT ----------

      if (req.user.role === "restaurant") {
        const restaurant = await Restaurant.findOne({
          ownerId: req.user.id,
        });

        if (
          !restaurant ||
          order.restaurantId.toString() !==
            restaurant._id.toString()
        ) {
          return res.status(403).json({
            success: false,
            message: "This order does not belong to your restaurant",
          });
        }

        const restaurantAllowed = [
          "accepted",
          "preparing",
          "rider_assigned",
          "cancelled",
        ];

        if (!restaurantAllowed.includes(status)) {
          return res.status(403).json({
            success: false,
            message:
              "Restaurant cannot set this order status",
          });
        }

        if (status === "rider_assigned") {
          if (!req.body.riderId) {
            return res.status(400).json({
              success: false,
              message: "Rider ID is required",
            });
          }

          const rider = await User.findOne({
            _id: req.body.riderId,
            role: "rider",
          });

          if (!rider) {
            return res.status(400).json({
              success: false,
              message: "Valid rider not found",
            });
          }

          order.riderId = rider._id;
        }
      }

      // ---------- RIDER ----------

      if (req.user.role === "rider") {
        const riderAllowed = [
          "picked_up",
          "out_for_delivery",
          "delivered",
        ];

        if (!riderAllowed.includes(status)) {
          return res.status(403).json({
            success: false,
            message: "Rider cannot set this order status",
          });
        }

        if (
          order.riderId &&
          order.riderId.toString() !== req.user.id
        ) {
          return res.status(403).json({
            success: false,
            message: "This order belongs to another rider",
          });
        }

        if (!order.riderId) {
          order.riderId = req.user.id;
        }
      }

      // ---------- CUSTOMER ----------

      if (req.user.role === "customer") {
        if (
          order.customerId.toString() !==
          req.user.id
        ) {
          return res.status(403).json({
            success: false,
            message: "This order does not belong to you",
          });
        }

        return res.status(403).json({
          success: false,
          message:
            "Customer cannot change order status",
        });
      }

      order.status = status;

      if (status === "delivered") {
        if (order.paymentMethod === "cod") {
          order.paymentStatus = "paid";
        }
      }

      await order.save();

      res.json({
        success: true,
        message: "Order status updated",
        order,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// ================= RIDER ACCEPT ORDER =================

app.patch(
  "/api/orders/:id/accept-rider",
  auth,
  async (req, res) => {
    try {
      if (req.user.role !== "rider") {
        return res.status(403).json({
          success: false,
          message: "Rider account required",
        });
      }

      const order = await Order.findById(
        req.params.id
      );

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (
        order.status !== "rider_assigned" ||
        order.riderId
      ) {
        return res.status(400).json({
          success: false,
          message: "Order is not available",
        });
      }

      order.riderId = req.user.id;
      order.status = "rider_assigned";

      await order.save();

      res.json({
        success: true,
        message: "Delivery accepted",
        order,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// ================= RIDERS LIST =================

app.get("/api/riders", auth, async (req, res) => {
  try {
    if (req.user.role !== "restaurant") {
      return res.status(403).json({
        success: false,
        message: "Restaurant account required",
      });
    }

    const riders = await User.find({
      role: "rider",
    }).select("_id name phone");

    res.json({
      success: true,
      riders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ================= START SERVER =================

app.listen(PORT, () => {
  console.log(
    `Food Business Backend running at http://localhost:${PORT}`
  );
});