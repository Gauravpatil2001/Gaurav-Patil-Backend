const express = require("express");
const router = express.Router();
const axios = require("axios");
const Transaction = require("../models/transaction");

// Fetch data and initialize the database
router.get("/init", async (req, res) => {
  try {
    const response = await axios.get(
      "https://s3.amazonaws.com/roxiler.com/product_transaction.json"
    );
    const transactions = response.data;

    await Transaction.deleteMany({});

    const formattedTransactions = transactions.map((transaction) => ({
      id: transaction.id,
      title: transaction.title,
      price: transaction.price,
      description: transaction.description,
      category: transaction.category,
      image: transaction.image,
      sold: transaction.sold,
      dateOfSale: new Date(transaction.dateOfSale),
    }));

    await Transaction.insertMany(formattedTransactions);

    res.status(200).send({
      message: "Database initialized successfully",
      count: formattedTransactions.length,
    });
  } catch (error) {
    res.status(500).send({ error: "Failed to initialize the database" });
  }
});

router.get("/transactions", async (req, res) => {
  const { page = 1, perPage = 10, search = "", month } = req.query;

  let monthIndex = null;
  if (month) {
    monthIndex = new Date(
      `${month.charAt(0).toUpperCase() + month.slice(1)} 1, 2021`
    ).getMonth();
  }

  try {
    let query = {};

    const isSearchNumber = !isNaN(Number(search));

    if (search) {
      query = {
        $or: [
          { title: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ],
      };

      if (isSearchNumber) {
        console.log("Search is a number:", search);

        query = { price: { $eq: Number(search) } };
      }
    }

    if (monthIndex !== null) {
      query = {
        ...query,
        $expr: {
          $eq: [{ $month: "$dateOfSale" }, monthIndex + 1],
        },
      };
    }

    const total = await Transaction.countDocuments(query);

    const transactions = await Transaction.find(query)
      .skip((page - 1) * perPage)
      .limit(parseInt(perPage));

    res.status(200).json({
      total,
      page: parseInt(page),
      perPage: parseInt(perPage),
      transactions,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch transactions", error: error.message });
  }
});

router.get("/statistics", async (req, res) => {
  const { month } = req.query;

  console.log("Received month for statistics:", month);

  let monthIndex = null;
  if (month) {
    monthIndex = new Date(
      `${month.charAt(0).toUpperCase() + month.slice(1)} 1, 2021`
    ).getMonth();
    console.log("Month Index:", monthIndex);
  }

  try {
    let matchQuery = {};
    if (monthIndex !== null) {
      matchQuery = {
        $expr: {
          $eq: [{ $month: "$dateOfSale" }, monthIndex + 1],
        },
      };
    }

    const statistics = await Transaction.aggregate([
      {
        $match: matchQuery,
      },
      {
        $group: {
          _id: null,
          totalSaleAmount: {
            $sum: { $cond: [{ $eq: ["$sold", true] }, "$price", 0] },
          },
          totalSoldItems: { $sum: { $cond: [{ $eq: ["$sold", true] }, 1, 0] } },
          totalNotSoldItems: {
            $sum: { $cond: [{ $eq: ["$sold", false] }, 1, 0] },
          },
        },
      },
    ]);

    if (!statistics.length) {
      return res.status(200).json({
        totalSaleAmount: 0,
        totalSoldItems: 0,
        totalNotSoldItems: 0,
      });
    }

    const { totalSaleAmount, totalSoldItems, totalNotSoldItems } =
      statistics[0];

    res.status(200).json({
      totalSaleAmount,
      totalSoldItems,
      totalNotSoldItems,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch statistics", error: error.message });
  }
});

router.get("/barchart", async (req, res) => {
  const { month } = req.query;

  let matchStage = {};

  if (month) {
    const monthIndex =
      new Date(
        `${month.charAt(0).toUpperCase() + month.slice(1)} 1, 2021`
      ).getMonth() + 1;
    console.log("Month Index:", monthIndex);

    matchStage = {
      $match: {
        $expr: {
          $eq: [{ $month: "$dateOfSale" }, monthIndex],
        },
      },
    };
  }

  try {
    const barChartResponse = await Transaction.aggregate([
      ...(month ? [matchStage] : []),
      {
        $bucket: {
          groupBy: "$price",
          boundaries: [
            0,
            100,
            200,
            300,
            400,
            500,
            600,
            700,
            800,
            900,
            Infinity,
          ],
          default: "901-above",
          output: {
            count: { $sum: 1 },
          },
        },
      },
    ]);

    const formattedResponse = barChartResponse.map((bucket) => {
      let range;
      if (bucket._id === "901-above") {
        range = "901-above";
      } else if (typeof bucket._id === "number") {
        const min = bucket._id;
        const max = min + 99;
        range = `${min}-${max}`;
      } else {
        console.error("Unexpected bucket _id:", bucket._id);
        return { range: "Unknown", count: 0 };
      }

      return {
        range,
        count: bucket.count,
      };
    });

    res.status(200).json(formattedResponse);
  } catch (error) {
    console.error("Error fetching bar chart data:", error);
    res.status(500).json({
      message: "Failed to fetch bar chart data",
      error: error.message,
    });
  }
});

router.get("/piechart", async (req, res) => {
  const { month } = req.query;

  console.log("Received month for pie chart:", month);
  let monthIndex = null;
  if (month) {
    monthIndex = new Date(
      `${month.charAt(0).toUpperCase() + month.slice(1)} 1, 2021`
    ).getMonth();
    console.log("Month Index:", monthIndex);
  }

  try {
    let matchQuery = {};
    if (monthIndex !== null) {
      matchQuery = {
        $expr: {
          $eq: [{ $month: "$dateOfSale" }, monthIndex + 1],
        },
      };
    }

    const transactions = await Transaction.find(matchQuery);
    console.log("Fetched Transactions:", transactions);

    const categoryCounts = transactions.reduce((acc, transaction) => {
      const category = transaction.category;
      if (acc[category]) {
        acc[category] += 1;
      } else {
        acc[category] = 1;
      }
      return acc;
    }, {});

    const results = Object.entries(categoryCounts).map(([category, count]) => ({
      category,
      count,
    }));

    // Return the results for the pie chart
    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch pie chart data",
      error: error.message,
    });
  }
});

router.get("/combined", async (req, res) => {
  const { month, page = 1, perPage = 10, search = "" } = req.query;

  try {
    const transactionsResponse = await Transaction.find({
      $and: [
        month
          ? {
              $expr: {
                $eq: [
                  { $month: "$dateOfSale" },
                  new Date(`${month} 1, 2021`).getMonth() + 1,
                ],
              },
            }
          : {},
        search
          ? {
              $or: [
                { title: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { price: Number(search) },
              ],
            }
          : {},
      ],
    })
      .skip((page - 1) * perPage)
      .limit(parseInt(perPage));

    // 2. Fetch Bar Chart Data
    const barChartResponse = await Transaction.aggregate([
      {
        $match: month
          ? {
              $expr: {
                $eq: [
                  { $month: "$dateOfSale" },
                  new Date(`${month} 1, 2021`).getMonth() + 1,
                ],
              },
            }
          : {},
      },
      {
        $bucket: {
          groupBy: "$price",
          boundaries: [
            0,
            100,
            200,
            300,
            400,
            500,
            600,
            700,
            800,
            900,
            Infinity,
          ],
          default: "901-above",
          output: { count: { $sum: 1 } },
        },
      },
    ]);

    // 3. Fetch Pie Chart Data
    const pieChartResponse = await Transaction.aggregate([
      {
        $match: month
          ? {
              $expr: {
                $eq: [
                  { $month: "$dateOfSale" },
                  new Date(`${month} 1, 2021`).getMonth() + 1,
                ],
              },
            }
          : {},
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ]);

    // Combine all responses into one final JSON object
    const combinedResponse = {
      transactions: {
        total: await Transaction.countDocuments(),
        page: parseInt(page),
        perPage: parseInt(perPage),
        transactions: transactionsResponse,
      },
      barChart: barChartResponse,
      pieChart: pieChartResponse.map((item) => ({
        category: item._id,
        count: item.count,
      })),
    };

    res.status(200).json(combinedResponse);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch combined data", error: error.message });
  }
});

module.exports = router;
