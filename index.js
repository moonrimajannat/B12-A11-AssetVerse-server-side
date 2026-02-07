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
    const requestsCollection = client.db('AssetVerse').collection('requestsCollection');
    const assignedAssetsCollection = client.db('AssetVerse').collection('assignedAssetsCollection');
    const employeeAffiliationsCollection = client.db('AssetVerse').collection('employeeAffiliationsCollection');

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

    app.get("/asset-requests", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {}

      if (email) {
        query.customerEmail = email;

        // check email address
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: 'forbidden access' })
        }
      }

      const cursor = requestsCollection.find();

      const result = await cursor.toArray();
      res.send(result);
    });

    app.delete("/assets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await assetsCollection.deleteOne(query);
      res.send(result);
    })

    // UPDATE an asset
    app.put("/assets/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const result = await assetsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      res.send(result);
    });

    //update-profile-image
    app.put("/users/profile-image/:email", async (req, res) => {
      const email = req.params.email;
      const { profileImage } = req.body;

      const result = await usersCollection.updateOne(
        { email: email },
        { $set: { profileImage } }
      );

      res.send(result);
    });

    // update profile
    app.put("/users/profile/:email", async (req, res) => {
      const email = req.params.email;
      const { name, companyName, dateOfBirth } = req.body;

      // create an object with only the fields that are sent
      const updatedData = {};
      if (name) updatedData.name = name;
      if (companyName) updatedData.companyName = companyName;
      if (dateOfBirth) updatedData.dateOfBirth = dateOfBirth;

      const result = await usersCollection.updateOne(
        { email: email },
        { $set: updatedData }
      );

      res.send(result);
    });

    // add asset
    app.post("/assets", verifyFBToken, async (req, res) => {
      const asset = req.body;

      if (asset.hrEmail !== req.decoded_email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const assetData = {
        productName: asset.productName,
        productImage: asset.productImage,
        productType: asset.productType,
        productQuantity: parseInt(asset.productQuantity),
        availableQuantity: parseInt(asset.availableQuantity),
        dateAdded: asset.dateAdded,
        hrEmail: asset.hrEmail,
        companyName: asset.companyName,
      };

      const result = await assetsCollection.insertOne(assetData);
      res.send(result);
    });

    
    app.patch("/asset-requests/approve/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;

        // Find the request
        const request = await requestsCollection.findOne({ _id: new ObjectId(id) });

        if (!request || request.requestStatus !== "pending") {
          return res.status(400).send({ message: "Invalid request" });
        }

        // Deduct asset quantity
        const assetUpdate = await assetsCollection.updateOne(
          { _id: request.assetId, availableQuantity: { $gt: 0 } },
          { $inc: { availableQuantity: -1 } }
        );

        if (assetUpdate.modifiedCount === 0) {
          return res.status(400).send({ message: "Asset not available" });
        }

        // Update request status to approved
        await requestsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              requestStatus: "approved",
              approvalDate: new Date().toISOString().split("T")[0],
              processedBy: req.decoded_email,
            },
          }
        );

        // Insert into assignedAssets
        await assignedAssetsCollection.insertOne({
          assetId: request.assetId,
          assetName: request.assetName,
          assetImage: request.assetImage || "",
          assetType: request.assetType,
          employeeEmail: request.requesterEmail,
          employeeName: request.employeeName,
          hrEmail: req.decoded_email,
          companyName: request.companyName,
          assignmentDate: new Date().toISOString().split("T")[0],
          returnDate: null,
          status: "assigned",
        });

        // Create affiliation if first approved request
        const existingAffiliation = await employeeAffiliationsCollection.findOne({
          employeeEmail: request.requesterEmail,
          status: "active"
        });

        if (!existingAffiliation) {
          await employeeAffiliationsCollection.insertOne({
            employeeEmail: request.requesterEmail,
            employeeName: request.employeeName,
            hrEmail: req.decoded_email,
            companyName: request.companyName,
            companyLogo: request.companyLogo || "",
            affiliationDate: new Date().toISOString().split("T")[0],
            status: "active"
          });
        }

        res.send({ modifiedCount: 1 });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });













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