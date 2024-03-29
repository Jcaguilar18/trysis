import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";

import cron from 'node-cron';

// Schedule the task to run at 11:59 PM every day
cron.schedule('59 18 * * *', async () => {
  try {
    // Copy data from items to report
    await db.query('INSERT INTO report SELECT *, CURRENT_DATE AS item_date FROM item');
    console.log('Data copied from items to report successfully at 11:59 PM.');
  } catch (error) {
    console.error('Error copying data:', error);
  }
});


const app = express();
const port = 3000;
const saltRounds = 10;

//test
env.config();

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});


db.connect();

app.get("/", (req, res) => {
  res.render("login.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

// Assuming all necessary imports are at the top of your solution.js file


import { fileURLToPath } from "url";
import { dirname, join } from "path";
import PDFDocument from "pdfkit";
import { Parser } from "json2csv";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

// ... (other imports and configurations)

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ... (rest of your express and db setup)

// Helper function to generate CSV
const generateCSV = (data) => {
  const parser = new Parser();
  return parser.parse(data);
};

const generatePDF = (data) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const filePath = `report-${Date.now()}.pdf`;
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);
    
    // Set up the table header
    const tableTop = 100;
    const itemColumns = {
      classification_id: { columnWidth: 100, columnStart: 50 },
      material_name: { columnWidth: 150, columnStart: 150 },
      clustercode: { columnWidth: 100, columnStart: 300 },
      // Add other columns as necessary
    };

    // Draw the table header
    doc.fontSize(12);
    for (let key in itemColumns) {
      const title = key.replace(/_/g, ' ').toUpperCase();
      const { columnStart } = itemColumns[key];
      doc.text(title, columnStart, tableTop);
    }

    // Draw the table rows
    doc.fontSize(10);
    let i = 0;
    data.forEach(item => {
      const y = tableTop + 20 + (i * 20);
      for (let key in itemColumns) {
        const { columnStart } = itemColumns[key];
        doc.text(item[key], columnStart, y);
      }
      i++;
    });

    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
};

// Route handler for report generation
app.post("/generate-report", async (req, res) => {
  // Extract startDate, endDate, and reportType from request body
  const { startDate, endDate, reportType } = req.body;

  try {
    // Replace this query with one that suits your needs
    const reportQueryResult = await db.query("SELECT * FROM report WHERE item_date BETWEEN $1 AND $2", [startDate, endDate]);
    const reportData = reportQueryResult.rows;

    if (reportType === 'pdf') {
      try {
        const pdfPath = await generatePDF(reportData);
        res.download(pdfPath, err => {
          if (err) {
            throw err; // Handle error, but ensure the file is deleted if it was created.
          }
          fs.unlinkSync(pdfPath); // Delete the file after sending it
        });
      } catch (pdfErr) {
        console.error('Error generating PDF:', pdfErr);
        res.status(500).send('Error generating PDF');
      }
    } else if (reportType === 'csv') {
      const csvString = generateCSV(reportData);
      const csvPath = join(__dirname, `report-${Date.now()}.csv`);
      fs.writeFileSync(csvPath, csvString);
      res.download(csvPath, err => {
        if (err) {
          throw err; // Handle error, but ensure the file is deleted if it was created.
        }
        fs.unlinkSync(csvPath); // Delete the file after sending it
      });
    }
  } catch (err) {
    console.error('Error generating report:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ... (rest of your express app logic)


app.get("/register", (req, res) => {
  res.render("register.ejs");
});


app.use('/uploads', express.static('uploads'));
// solution.js

// Existing imports and setup...

app.get("/logs", async (req, res) => {
  try {
    // The SELECT query now also retrieves the 'picture' field from the 'logs' table
    const logsResult = await db.query("SELECT * FROM logs ORDER BY log_date DESC");
    const logs = logsResult.rows;

    // Render the 'transaction-logs.ejs' template with the logs data, including picture URLs
    res.render("logs.ejs", { logs });
  } catch (err) {
    console.error("Error fetching transaction logs with pictures:", err);
    res.status(500).send("Internal Server Error");
  }
});

// ... the rest of your express app logic




app.get("/item", async (req, res) => {
  var roleOfQueryResult = await db.query("SELECT role FROM users WHERE username = $1", [req.session.username]);
  var roleOf = roleOfQueryResult.rows[0]?.role;
  var itemOfQueryResult = await db.query("SELECT * FROM item ");
  var clusterquery = await db.query("SELECT * FROM cluster");
  const cluster = clusterquery.rows;
      const item= itemOfQueryResult.rows;
      //console.log(item);
      //console.log(cluster); 
      //console.log(roleOf);
      res.render("item.ejs", {item, roleOf,cluster});
});

app.get("/manage", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  
      // Fetch user data from the database
      const usersResult = await db.query("SELECT * FROM users");
      const users = usersResult.rows;
      
      var roleOfQueryResult = await db.query("SELECT role FROM users WHERE username = $1", [req.session.username]);
      var roleOf = roleOfQueryResult.rows[0]?.role;
      console.log("Start: testing in /manage");
      console.log(roleOf);
      console.log(req.session.username);////////////////////////////////////////////// important code take note!
      console.log("end of testing: /manage")
   

      // Render the "manage.ejs" template with the user data
      res.render("manage.ejs", { users, roleOf });
  } catch (err) {
      console.log(err);
      res.redirect("/login");
  }
});


// Route to render the form for adding an item
app.get("/add-item", (req, res) => {
  const clcode = req.query.clustercode;
  res.render("add-item.ejs", {clcode});
});

app.get("/stock", async (req, res) => {
  try {
    var roleOfQueryResult = await db.query("SELECT role FROM users WHERE username = $1", [req.session.username]);
    var roleOf = roleOfQueryResult.rows[0]?.role;
    
    var clusterquery = await db.query("SELECT * FROM cluster");
    const cluster = clusterquery.rows;

    var itemOfQueryResult = await db.query(`
      SELECT item.*, cluster.description as cluster_description 
      FROM item 
      INNER JOIN cluster ON item.clustercode = cluster.clustercode`);
    const items = itemOfQueryResult.rows;
      console.log("testStock uname");
    console.log(req.session.username);
    console.log("end /stock");
     
    res.render("stock.ejs", {items, roleOf, cluster});
  } catch (error) {
    console.error(`Error: ${error}`);
    res.status(500).send('An error occurred');
  }
});





app.get("/bin", async (req, res) => {
  var clustercode = req.query.clustercode;
  var itemOfQueryResult = await db.query(`
    SELECT item.*, cluster.description as cluster_description 
    FROM item 
    INNER JOIN cluster ON item.clustercode = cluster.clustercode 
    WHERE item.clustercode = $1`, [clustercode]);

  const items= itemOfQueryResult.rows;
  res.render("bin.ejs", {items});
});



app.get("/add-cluster", (req, res) => {
  res.render("add-cluster.ejs");
});

// Route to handle form submission for adding an item
app.post("/add-item", async (req, res) => {
  try {
    // Extract data from the request body
    const { materialName, clcode, price, available } = req.body;

    // Get the classification_id based on the clustercode
    const container = await db.query("SELECT * FROM item WHERE clustercode = $1", [clcode]);
    const container1 = container.rows[0];
    const { classification_id } = container1;

    // Get the current date
  

    // Insert the item into the database along with the current date
    await db.query(
      "INSERT INTO item (classification_id, material_name, clustercode, price, available) VALUES ($1, $2, $3, $4, $5, $6)",
      [classification_id, materialName, clcode, price, available]
    );

    // Redirect back to the original page after adding the item
    res.redirect("/item");
  } catch (error) {
    console.error("Error adding item:", error);
    res.status(500).send("Internal Server Error");
  }
});



app.post("/add-cluster", async (req, res) => {
  try {
      // Extract data from the request body
      const { clustercode, description, classificationid } = req.body;

      // Insert the item into the database
      await db.query(
          "INSERT INTO cluster (clustercode, description, classification_id) VALUES ($1, $2, $3)",
          [clustercode, description, classificationid]
      );

      // Redirect back to the original page after adding the item
      res.redirect("/item");
  } catch (error) {
      console.error("Error adding item:", error);
      res.status(500).send("Internal Server Error");
  }
});



app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/login");
  });
});

app.get("/dashboard", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.isAuthenticated()) {
    try {
      const roleOf = await db.query("SELECT role FROM users WHERE username = $1", [req.user.username]);
      req.session.username = req.user.username;
      req.session.roleOf = roleOf;

      
      //console.log('Accessed session username:', req.session.username);
      
       
      
      res.render("dashboard.ejs", { roleOf: roleOf.rows[0].role });
      
    } catch (err) {
      console.log(err);
      res.redirect("/login");
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/generate-report-page", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.isAuthenticated()) {
    try {
      const roleOf = await db.query("SELECT role FROM users WHERE username = $1", [req.user.username]);
      req.session.username = req.user.username;
      req.session.roleOf = roleOf;
      res.render("generate-report-page.ejs", { roleOf: roleOf.rows[0].role });
      
    } catch (err) {
      console.log(err);
      res.redirect("/login");
    }
  } else {
    res.redirect("/login");
  }
});

app.post(
  "/login", 
  passport.authenticate("local", {
    successRedirect: "/dashboard",
    failureRedirect: "/login",
  })
);


// app.post('/addstock', async (req, res) => {
//   try{
//   const { no, clustercode, incoming, outgoing,itemDescription } = req.body;
//   console.log('Item No:', no);
//   console.log('Cluster Code:', clustercode);
//   console.log('Item Description:', itemDescription);
//   console.log('Incoming Value:', incoming);
//   console.log('Outgoing Value:', outgoing);





//   res.send('Stock updated successfully!');
// }
// catch{

// }
// });

app.post('/addstock', async (req, res) => {
  const { no, clustercode, incoming, outgoing, itemDescription } = req.body;

  try {
    // Check if the item with the given itemDescription exists in the database
    const checkResult = await db.query("SELECT * FROM item WHERE material_name = $1", [itemDescription]);
console.log("entered");
    if (checkResult.rows.length === 0) {
      res.status(400).send('Item not found');
      return;
    }

    // Parse incoming and outgoing as integers
    const parsedIncoming = parseInt(incoming, 10);
    const parsedOutgoing = parseInt(outgoing, 10);

    // Check if parsing is successful
    if (isNaN(parsedIncoming) || isNaN(parsedOutgoing)) {
      res.status(400).send('Invalid incoming or outgoing value');
      return;
    }

    // Fetch the available value from the item table
    const fetchAvailableQuery = `SELECT available FROM item WHERE material_name = $1`;
    const fetchAvailableResult = await db.query(fetchAvailableQuery, [itemDescription]);
    const available = fetchAvailableResult.rows[0].available;

    // Calculate new available value
    const newAvailable = available + parsedIncoming - parsedOutgoing;

    // Update the item table
    const updateQuery = `
      UPDATE item
      SET beginning_inventory = $1,
          available = $2,
          total_outgoing = total_outgoing + $3,
          total_incoming = total_incoming + $4
      WHERE material_name = $5
    `;
    await db.query(updateQuery, [newAvailable, newAvailable, parsedOutgoing, parsedIncoming, itemDescription]);

    //res.send('Stock updated successfully!');
    res.redirect("/stock");
  } catch (err) {
    console.error('Error updating stock:', err);
    res.status(500).send('Internal Server Error');
  }
});
//////////////
import path from 'path';
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir, { recursive: true });
}
///////////////////////////////
import multer from 'multer';

const storage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, 'uploads/');
    },
    filename: function (req, file, callback) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        callback(null, file.fieldname + '-' + uniqueSuffix);
    }
});

const upload = multer({ storage: storage });
////////////////
app.post("/register", upload.single('picture'), async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const role = req.body.roles;
  const status = req.body.status;
  const picture = req.file ? req.file.filename : null; // Store the file name of the uploaded picture

  try {
      const checkResult = await db.query("SELECT * FROM users WHERE username = $1", [username]);

      if (checkResult.rows.length > 0) {
          return res.redirect("/login"); // Use return to ensure that the rest of the code is not executed after the redirect
      } else {
          bcrypt.hash(password, saltRounds, async (err, hash) => {
              if (err) {
                  console.error("Error hashing password:", err);
                  return res.status(500).send("Error hashing password");
              }
              const result = await db.query(
                  "INSERT INTO users (username, password, role, status, picture_url) VALUES ($1, $2, $3, $4, $5) RETURNING *",
                  [username, hash, role, status, picture]
              );
              const user = result.rows[0];

              req.login(user, (err) => {
                  if (err) {
                      console.error(err);
                      return res.status(500).send("Error logging in user");
                  }
                  res.redirect("/dashboard");
              });
          });
      }
  } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
  }
});

/////////////


passport.use(
  new Strategy(async function verify(username, password, cb) {
    try {
      const stats = await db.query("SELECT status FROM users WHERE username = $1 ", [
        username,
         
      ]);
      var stat = stats.rows[0]?.status;


      console.log(stat);
      const result = await db.query("SELECT * FROM users WHERE username = $1 ", [
        username,
      ]);
      if(stat === "active"){
        if (result.rows.length > 0) {
          const user = result.rows[0];
          const storedHashedPassword = user.password;
          bcrypt.compare(password, storedHashedPassword, (err, valid) => {
            if (err) {
              //Error with password check
              console.error("Error comparing passwords:", err);
              return cb(err);
            } else {
              if (valid) {
                //Passed password check
                return cb(null, user);
              } else {
                //Did not pass password check
                return cb(null, false);
              }
            }
          });
        } else {
          return cb("User not found");
        }
      }else{
        return cb(null,false);
      }
       
      
     

      
    } catch (err) {
      console.log(err);
    }

    
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});
passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
