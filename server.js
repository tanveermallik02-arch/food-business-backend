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
const RESTAURANT_COMMISSION_PERCENT = Number(process.env.RESTAURANT_COMMISSION_PERCENT || 20);

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

    // Settlement accounting
    restaurantCommission: { type: Number, default: 0 },
    restaurantPayable: { type: Number, default: 0 },
    riderEarning: { type: Number, default: 0 },
    platformEarning: { type: Number, default: 0 },
    restaurantSettlementStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    riderSettlementStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    restaurantSettlementPaidAt: { type: Date, default: null },
    riderSettlementPaidAt: { type: Date, default: null },

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

    const subtotalAmount = Number(subtotal || 0);
    const deliveryFeeAmount = Number(deliveryFee || 30);
    const commissionAmount = Math.round(subtotalAmount * RESTAURANT_COMMISSION_PERCENT / 100 * 100) / 100;
    const riderEarningAmount = deliveryFeeAmount;
    const platformEarningAmount = commissionAmount;
    const restaurantPayableAmount = Math.max(0, subtotalAmount - commissionAmount);

    const order = await Order.create({
      customerId: req.user.id,
      restaurantId,
      items,
      subtotal: subtotalAmount,
      deliveryFee: deliveryFeeAmount,
      totalAmount: Number(totalAmount || 0),
      restaurantCommission: commissionAmount,
      restaurantPayable: restaurantPayableAmount,
      riderEarning: riderEarningAmount,
      platformEarning: platformEarningAmount,
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
        "ready",
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
          "ready",
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


// ================= ADMIN AUTH & API =================

function adminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.substring(7)
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Admin login required",
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin account required",
      });
    }
    req.admin = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired admin token",
    });
  }
}

app.post("/api/auth/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const adminEmail =
      process.env.ADMIN_EMAIL || "admin@foodbusiness.com";
    const adminPassword =
      process.env.ADMIN_PASSWORD || "admin123";

    if (
      !email ||
      !password ||
      email.trim().toLowerCase() !== adminEmail.toLowerCase() ||
      password !== adminPassword
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin email or password",
      });
    }

    const token = jwt.sign(
      {
        id: "admin",
        role: "admin",
        email: adminEmail,
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      message: "Admin login successful",
      token,
      admin: {
        email: adminEmail,
        role: "admin",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.get("/api/admin/overview", adminAuth, async (req, res) => {
  try {
    const [orders, restaurants, riders, customers] =
      await Promise.all([
        Order.find().sort({ createdAt: -1 }).lean(),
        Restaurant.find().sort({ createdAt: -1 }).lean(),
        User.find({ role: "rider" })
          .select("_id name phone createdAt")
          .sort({ createdAt: -1 })
          .lean(),
        User.find({ role: "customer" })
          .select("_id name phone createdAt")
          .sort({ createdAt: -1 })
          .lean(),
      ]);

    const restaurantMap = new Map(
      restaurants.map((r) => [r._id.toString(), r])
    );

    const riderMap = new Map(
      riders.map((r) => [r._id.toString(), r])
    );

    const customerMap = new Map(
      customers.map((c) => [c._id.toString(), c])
    );

    const formattedOrders = orders.map((o) => ({
      id: o._id,
      customer: customerMap.get(o.customerId?.toString())?.name || "Customer",
      customerPhone:
        customerMap.get(o.customerId?.toString())?.phone || "",
      restaurant:
        restaurantMap.get(o.restaurantId?.toString())?.name ||
        "Restaurant",
      rider:
        riderMap.get(o.riderId?.toString())?.name || "",
      riderPhone:
        riderMap.get(o.riderId?.toString())?.phone || "",
      amount: Number(o.totalAmount || 0),
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      restaurantCommission: Number(o.restaurantCommission || 0),
      restaurantPayable: Number(o.restaurantPayable || 0),
      riderEarning: Number(o.riderEarning || 0),
      platformEarning: Number(o.platformEarning || 0),
      restaurantSettlementStatus: o.restaurantSettlementStatus || "pending",
      riderSettlementStatus: o.riderSettlementStatus || "pending",
      restaurantSettlementPaidAt: o.restaurantSettlementPaidAt || null,
      riderSettlementPaidAt: o.riderSettlementPaidAt || null,
      deliveryAddress: o.deliveryAddress,
      createdAt: o.createdAt,
    }));

    const customerOrders = {};
    for (const finalOrder of orders) {
      const key = finalOrder.customerId?.toString();
      if (key) customerOrders[key] = (customerOrders[key] || 0) + 1;
    }

    const restaurantOrders = {};
    for (const finalOrder of orders) {
      const key = finalOrder.restaurantId?.toString();
      if (key) restaurantOrders[key] = (restaurantOrders[key] || 0) + 1;
    }

    res.json({
      success: true,
      stats: {
        totalOrders: orders.length,
        totalSales: orders
          .filter((o) => o.status !== "cancelled")
          .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0),
        deliveredOrders: orders.filter(
          (o) => o.status === "delivered"
        ).length,
        cancelledOrders: orders.filter(
          (o) => o.status === "cancelled"
        ).length,
        activeRestaurants: restaurants.filter(
          (r) => r.isOpen !== false
        ).length,
        totalRestaurants: restaurants.length,
        totalRiders: riders.length,
        totalCustomers: customers.length,
      },
      restaurants: restaurants.map((r) => ({
        id: r._id,
        name: r.name || "",
        owner: r.phone || "",
        phone: r.phone || "",
        active: r.isOpen !== false,
        orders: restaurantOrders[r._id.toString()] || 0,
      })),
      riders: riders.map((r) => ({
        id: r._id,
        name: r.name || "",
        phone: r.phone || "",
        vehicle: "Bike",
        online: false,
        deliveries: orders.filter(
          (o) =>
            o.riderId &&
            o.riderId.toString() === r._id.toString() &&
            o.status === "delivered"
        ).length,
      })),
      customers: customers.map((c) => ({
        id: c._id,
        name: c.name || "",
        phone: c.phone || "",
        orders: customerOrders[c._id.toString()] || 0,
      })),
      orders: formattedOrders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.patch(
  "/api/admin/orders/:id/status",
  adminAuth,
  async (req, res) => {
    try {
      const { status } = req.body;
      const allowedStatuses = [
        "placed",
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

      order.status = status;

      if (status === "delivered" && order.paymentMethod === "cod") {
        order.paymentStatus = "paid";
      }

      await order.save();

      res.json({
        success: true,
        message: "Order status updated by admin",
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

app.patch(
  "/api/admin/restaurants/:id/toggle",
  adminAuth,
  async (req, res) => {
    try {
      const restaurant = await Restaurant.findById(req.params.id);

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: "Restaurant not found",
        });
      }

      restaurant.isOpen = !restaurant.isOpen;
      await restaurant.save();

      res.json({
        success: true,
        message: "Restaurant status updated",
        restaurant,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// ================= ADMIN PAYMENTS & SETTLEMENTS =================

app.get("/api/admin/settlements", adminAuth, async (req, res) => {
  try {
    const [orders, restaurants, riders] = await Promise.all([
      Order.find().sort({ createdAt: -1 }).lean(),
      Restaurant.find().lean(),
      User.find({ role: "rider" }).select("_id name phone").lean(),
    ]);

    const restaurantMap = new Map(restaurants.map(r => [r._id.toString(), r]));
    const riderMap = new Map(riders.map(r => [r._id.toString(), r]));
    const eligible = orders.filter(o => o.status === "delivered" && o.paymentStatus === "paid");

    const summary = {
      collected: eligible.reduce((n,o) => n + Number(o.totalAmount || 0), 0),
      restaurantPayable: eligible.reduce((n,o) => n + Number(o.restaurantPayable || 0), 0),
      riderPayable: eligible.reduce((n,o) => n + Number(o.riderEarning || 0), 0),
      platformEarning: eligible.reduce((n,o) => n + Number(o.platformEarning || 0), 0),
      pendingRestaurant: eligible.filter(o => (o.restaurantSettlementStatus || "pending") === "pending").reduce((n,o) => n + Number(o.restaurantPayable || 0), 0),
      pendingRider: eligible.filter(o => (o.riderSettlementStatus || "pending") === "pending").reduce((n,o) => n + Number(o.riderEarning || 0), 0),
    };

    const settlementOrders = eligible.map(o => ({
      id: o._id,
      restaurant: restaurantMap.get(o.restaurantId?.toString())?.name || "Restaurant",
      rider: riderMap.get(o.riderId?.toString())?.name || "Unassigned",
      totalAmount: Number(o.totalAmount || 0),
      restaurantCommission: Number(o.restaurantCommission || 0),
      restaurantPayable: Number(o.restaurantPayable || 0),
      riderEarning: Number(o.riderEarning || 0),
      platformEarning: Number(o.platformEarning || 0),
      restaurantSettlementStatus: o.restaurantSettlementStatus || "pending",
      riderSettlementStatus: o.riderSettlementStatus || "pending",
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      deliveredAt: o.updatedAt || o.createdAt,
    }));

    res.json({ success: true, summary, orders: settlementOrders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch("/api/admin/settlements/:id/restaurant", adminAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success:false, message:"Order not found" });
    if (order.status !== "delivered" || order.paymentStatus !== "paid") return res.status(400).json({ success:false, message:"Order is not eligible for settlement" });
    order.restaurantSettlementStatus = "paid";
    order.restaurantSettlementPaidAt = new Date();
    await order.save();
    res.json({ success:true, message:"Restaurant settlement marked paid", order });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
});

app.patch("/api/admin/settlements/:id/rider", adminAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success:false, message:"Order not found" });
    if (order.status !== "delivered" || order.paymentStatus !== "paid") return res.status(400).json({ success:false, message:"Order is not eligible for settlement" });
    if (!order.riderId) return res.status(400).json({ success:false, message:"No rider assigned to this order" });
    order.riderSettlementStatus = "paid";
    order.riderSettlementPaidAt = new Date();
    await order.save();
    res.json({ success:true, message:"Rider settlement marked paid", order });
  } catch (error) { res.status(500).json({ success:false, message:error.message }); }
});

// ================= START SERVER =================

app.listen(PORT, () => {
  console.log(
    `Food Business Backend running at http://localhost:${PORT}`
  );
});