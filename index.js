const express = require('express');
const mongoose = require('mongoose');
const productRoutes = require('./routes/transaction');
const cors = require('cors');

const app = express();

// CORS middleware (apply it before defining the routes)
const corsOptions = {
    origin: 'http://localhost:3000', // Allow frontend running on localhost:3000 to access backend
    credentials: true,               // Allow credentials to be sent
    optionSuccessStatus: 200
};
app.use(cors(corsOptions));

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/mern-products', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('Could not connect to MongoDB', err));

// Use routes
app.use('/api/products', productRoutes);

// Start server
const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
