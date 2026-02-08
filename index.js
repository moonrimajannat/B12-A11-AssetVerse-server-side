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

    app.get("/employees", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {}

      if (email) {
        query.customerEmail = email;

        // check email address
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: 'forbidden access' })
        }
      }

      const cursor = employeeAffiliationsCollection.find();

      const result = await cursor.toArray();
      res.send(result);
    });

    // Employee assets
    app.get("/my-assets", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email;

        // security check
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const assets = await assignedAssetsCollection.find({ employeeEmail: email }).sort({ assignmentDate: -1 }).toArray();

        res.send(assets);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
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

    // request approved
    app.patch("/asset-requests/approve/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;

        // Find the request
        const request = await requestsCollection.findOne({
          _id: new ObjectId(id)
        });

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

        // Update request status
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
          requestDate: request.requestDate,
          approvalDate: new Date().toISOString().split("T")[0],
          returnDate: null,
          status: "assigned",
        });

        // Check existing affiliation
        const existingAffiliation =
          await employeeAffiliationsCollection.findOne({
            employeeEmail: request.requesterEmail,
            status: "active",
          });

        if (!existingAffiliation) {
          // Create affiliation (first asset)
          await employeeAffiliationsCollection.insertOne({
            employeeEmail: request.requesterEmail,
            employeeName: request.employeeName,
            employeePhoto: request.employeePhoto || "",
            hrEmail: req.decoded_email,
            companyName: request.companyName,
            companyLogo: request.companyLogo || "",
            affiliationDate: new Date().toISOString().split("T")[0],
            assetsCount: 1,
            status: "active",
          });
        } else {
          // Increment asset count
          await employeeAffiliationsCollection.updateOne(
            { _id: existingAffiliation._id },
            { $inc: { assetsCount: 1 } }
          );
        }

        res.send({ modifiedCount: 1 });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // request rejected
    app.patch("/asset-requests/reject/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;

        // Update request status to rejected
        const result = await requestsCollection.updateOne(
          { _id: new ObjectId(id), requestStatus: "pending" },
          {
            $set: {
              requestStatus: "rejected",
              approvalDate: new Date().toISOString().split("T")[0],
              processedBy: req.decoded_email,
            },
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(400).send({ message: "Request not found or already processed" });
        }

        res.send({ modifiedCount: result.modifiedCount });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    //remove employee
    app.patch("/employees/remove/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;

      // Get affiliation
      const affiliation = await employeeAffiliationsCollection.findOne({
        _id: new ObjectId(id),
        status: "active",
      });

      if (!affiliation) {
        return res.status(404).send({ message: "Employee not found" });
      }

      // Mark affiliation inactive
      await employeeAffiliationsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: "inactive",
            assetsCount: 0
          }
        }
      );

      // Find active assets
      const assignedAssets = await assignedAssetsCollection.find({
        employeeEmail: affiliation.employeeEmail,
        status: "assigned"
      }).toArray();

      for (const asset of assignedAssets) {
        // Mark asset returned
        await assignedAssetsCollection.updateOne(
          { _id: asset._id },
          {
            $set: {
              status: "returned",
              returnDate: new Date().toISOString().split("T")[0]
            }
          }
        );

        // Increase available quantity
        await assetsCollection.updateOne(
          { _id: asset.assetId },
          { $inc: { availableQuantity: 1 } }
        );
      }

      res.send({ modifiedCount: 1 });
    });

    //returned asset
    app.patch("/assets/return/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;

        // Find assigned asset
        const assignedAsset = await assignedAssetsCollection.findOne({
          _id: new ObjectId(id),
          status: "assigned",
        });

        if (!assignedAsset) {
          return res.status(400).send({ message: "Invalid asset return" });
        }

        // Security check
        if (assignedAsset.employeeEmail !== req.decoded_email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        // Check asset type
        if (assignedAsset.assetType !== "Returnable") {
          return res.status(400).send({ message: "Asset is not returnable" });
        }

        // Mark asset as returned
        await assignedAssetsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "returned",
              returnDate: new Date().toISOString().split("T")[0],
            },
          }
        );

        // Increase available quantity
        await assetsCollection.updateOne(
          { _id: assignedAsset.assetId },
          { $inc: { availableQuantity: 1 } }
        );

        // Decrease employee asset count
        await employeeAffiliationsCollection.updateOne(
          {
            employeeEmail: assignedAsset.employeeEmail,
            status: "active",
          },
          { $inc: { assetsCount: -1 } }
        );

        res.send({ modifiedCount: 1 });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    //request asset
    app.post("/asset-requests", verifyFBToken, async (req, res) => {
      try {
        const request = req.body;

        const newRequest = {
          assetId: new ObjectId(request.assetId),
          assetName: request.assetName,
          assetType: request.assetType,
          assetImage: request.assetImage || "",
          employeeName: request.employeeName,
          requesterEmail: request.requesterEmail,
          hrEmail: request.hrEmail,
          companyName: request.companyName,
          requestDate: request.requestDate,
          approvalDate: null,
          requestStatus: "pending",
          note: request.note || "",
          processedBy: request.hrEmail,
        };

        const result = await requestsCollection.insertOne(newRequest);
        res.send(result);

      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to create asset request" });
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