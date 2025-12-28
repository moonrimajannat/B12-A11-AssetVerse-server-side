const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;
require('dotenv').config();


var admin = require("firebase-admin");

var serviceAccount = require("./assetverse-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// middleware
app.use(cors());
app.use(express.json());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }

  try {
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    // console.log('decoded in the token', decoded);
    req.decoded_email = decoded.email;
    next();
  }
  catch (err) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
}

//Mongo URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@pawmart.dijiqjd.mongodb.net/?appName=PawMart`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    const usersCollection = client.db('AssetVerse').collection('usersCollection');
    const packagesCollection = client.db('AssetVerse').collection('packagesCollection');
    const assetsCollection = client.db('AssetVerse').collection('assetsCollection');

    app.post("/users", async (req, res) => {
      try {
        const userInfo = req.body;

        // Check if user already exists
        const existingUser = await usersCollection.findOne({
          email: userInfo.email,
        });

        if (existingUser) {
          return res.status(409).send({ message: "User already exists" });
        }

        const result = await usersCollection.insertOne(userInfo);
        res.status(201).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;

      try {
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(user);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/packages", async (req, res) => {

      const cursor = packagesCollection.find();

      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/assets", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {}

      if (email) {
        query.customerEmail = email;

        // check email address
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: 'forbidden access' })
        }
      }

      const cursor = assetsCollection.find();

      const result = await cursor.toArray();
      res.send(result);
    });

    // // DELETE an asset
    // app.delete("/assets/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const result = await assetsCollection.deleteOne({ _id: id });
    //   res.send(result);
    // });

    app.delete("/assets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await assetsCollection.deleteOne(query);
      res.send(result);
    })






    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get("/", (req, res) => {
  res.send('user server is available');
})

app.listen(port, () => {
  console.log(`user server started on Port: ${port}`);
})