import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";
import cron from 'node-cron';

cron.schedule('14 18 * * *', async () => {
  try {
    // Begin transaction
    await db.query('BEGIN');

    // Insert the backup into the report table with the current timestamp
    await db.query(`
      INSERT INTO report (classification_id, material_name, clustercode, price, description, item_id, total_incoming, total_outgoing, beginning_inventory, item_date, available) 
      SELECT classification_id, material_name, clustercode, price, description, item_id, total_incoming, total_outgoing, available, NOW(), available
      FROM item
    `);
    console.log('Data backed up successfully.');

    // Update the beginning_inventory to the most recent backup's available for each item
    const updateBeginningInventoryQuery = `
      UPDATE item i
      SET beginning_inventory = (
        SELECT r.available
        FROM report r
        WHERE r.material_name = i.material_name
        ORDER BY r.item_date DESC
        LIMIT 1
      )
    `;
    await db.query(updateBeginningInventoryQuery);

    // Reset incoming and outgoing totals
    await db.query('UPDATE item SET total_incoming = 0, total_outgoing = 0');
    console.log('Incoming and outgoing totals reset to zero.');

    // Commit transaction
    await db.query('COMMIT');
  } catch (error) {
    // Rollback transaction in case of error
    await db.query('ROLLBACK');
    console.error('Error during backup process:', error);
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
app.use(express.json());
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




import { fileURLToPath } from "url";
import { dirname, join } from "path";
import PDFDocument from "pdfkit";
import { Parser } from "json2csv";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();



const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
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


app.post("/generate-report-page", async (req, res) => {
  const { endDate } = req.body;
  const currentUser = req.session.username;
const currentRole =req.session.roleOf;

const marker = new Date(req.body.endDate).toISOString().split('T')[0];
console.log(currentRole);
console.log(currentUser);
console.log(marker);
  try {
    const reportQueryResult = await db.query(`
    SELECT classification_id, clustercode, description, available, price, item_date
FROM report
WHERE item_date::DATE = $1

    `, [endDate]);
    

    if (reportQueryResult.rows.length === 0) {
      return res.status(404).send('No report found for the selected date.');
    }

    let aggregatedData = {};
    reportQueryResult.rows.forEach(item => {
      const key = item.clustercode;
      if (!aggregatedData[key]) {
        aggregatedData[key] = {
          classification_id: item.classification_id,
          clustercode: item.clustercode,
          descriptions: new Set(),
          total_amount: 0
        };
      }
      aggregatedData[key].descriptions.add(item.description);
      aggregatedData[key].total_amount += (item.available * item.price);
    });

    const reportData = Object.values(aggregatedData).map(item => ({
      ...item,
      description: Array.from(item.descriptions).join(", ")
    }));

    // Calculate subtotals for each classification
    let subtotals = reportData.reduce((acc, item) => {
      const classification = item.classification_id.toString();
      acc[classification] = (acc[classification] || 0) + item.total_amount;
      return acc;
    }, {});

    
    

    // Calculate the grand total
    let grandTotal = Object.values(subtotals).reduce((total, current) => total + current, 0);
    console.log(reportData[0].item_date);
    console.log(reportQueryResult.rows);
    console.log(reportData);

    res.render("report-page.ejs", {
      reportData,
      subtotals,
      grandTotal,
      currentUser: req.session.username,
  currentRole: req.session.roleOf,
      marker
    });
  } catch (err) {
    console.error('Error generating report page:', err);
    res.status(500).send('Internal Server Error');
  }
});


app.post('/generate-bincard', async (req, res) => {
  

  try {
    const bincardDataQuery = await db.query(`
      SELECT clustercode, material_name, description, beginning_inventory, total_incoming, total_outgoing, available, price
      FROM item
      ORDER BY clustercode
    `);

    let bincards = {};

    bincardDataQuery.rows.forEach(item => {
      const clustercode = item.clustercode;
      if (!bincards[clustercode]) {
        bincards[clustercode] = { items: [] };
      }

      bincards[clustercode].items.push({
        name: item.material_name,
        description: item.description,
        beginningInventory: item.beginning_inventory,
        totalIncoming: item.total_incoming,
        totalOutgoing: item.total_outgoing,
        available: item.available,
        unitPrice: item.price,
        totalValue: item.available * item.price
      });
    });

    res.render('bincard.ejs', {
      bincards: bincards,
      currentUser: req.session.username,
  currentRole: req.session.roleOf,
    });
  } catch (err) {
    console.error('Error generating bin card:', err);
    res.status(500).send('Internal Server Error');
  }
});

async function downloadCSV() {
  try {
    const response = await fetch('/path/to/bincards/data');
    const bincards = await response.json();

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Cluster Code,Name of Material,Description,Beginning Inventory,Total Incoming,Total Outgoing,Available,Unit Price,Total Value\n";

    Object.keys(bincards).forEach(clusterCode => {
      bincards[clusterCode].items.forEach(item => {
        const row = `${clusterCode},${item.name},${item.description},${item.beginningInventory},${item.totalIncoming},${item.totalOutgoing},${item.available},"₱${item.unitPrice.toFixed(2)}","₱${item.totalValue.toFixed(2)}"`;
        csvContent += row + "\n";
      });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "bin_cards_data.csv");
    document.body.appendChild(link);
    link.click();
  } catch (error) {
    console.error('Error fetching bincards data:', error);
  }
}









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
app.use('/uploads', express.static('uploads'));
// ... (rest of your express app logic)

app.post('/update-item', async (req, res) => {
  const { items } = req.body;

  try {
      for (const item of items) {
          const { clustercode, original_material_name, new_material_name } = item;

          // Skip update if new_material_name is the same as original or blank
          if (new_material_name.trim() === "" || new_material_name === original_material_name) {
              continue; // Skip to the next item
          }

          // Check for existing material name in the same cluster
          const existingCheck = await db.query(
              'SELECT COUNT(*) FROM item WHERE clustercode = $1 AND material_name = $2',
              [clustercode, new_material_name]
          );

          if (existingCheck.rows[0].count > 0) {
              // If the new material name already exists, skip this item
              console.log(`Skipped updating item with clustercode ${clustercode} to existing material name ${new_material_name}`);
              continue;
          }

          // Proceed with update if new_material_name is unique within the cluster
          await db.query(
              'UPDATE item SET material_name = $1 WHERE clustercode = $2 AND material_name = $3',
              [new_material_name, clustercode, original_material_name]
          );
      }

      res.json({ message: 'Items updated successfully, with no duplicates.' });
  } catch (error) {
      console.error('Error updating items:', error);
      res.status(500).json({ error: 'Failed to update items.' });
  }
});









app.get("/register", (req, res) => {
  res.render("register.ejs");
});
app.post("/update-account", async (req, res) => {
  const { userId, username, password, status, firstname, lastname } = req.body;
  let logDescription = 'Account updated: '; // Initialize log description

  try {
    let updateFields = {
      username: username,
      status: status,
      firstname: firstname,
      lastname: lastname
    };

    if (password && password.trim() !== '') {
      const pepperedPassword = password + (process.env.PEPPER || '');
      const hashedPassword = await bcrypt.hash(pepperedPassword, saltRounds);
      updateFields.password = hashedPassword;
      logDescription += 'password changed, ';
    }

    const setClause = Object.keys(updateFields)
      .filter(key => updateFields[key] !== undefined && updateFields[key] !== '') // Make sure we don't update with empty strings
      .map((key, idx) => `${key} = $${idx + 1}`)
      .join(', ');

    const queryParams = Object.values(updateFields)
      .filter(value => value !== undefined && value !== '') // Filter out empty strings
      .concat(userId);

    const sqlQuery = `UPDATE users SET ${setClause} WHERE userid = $${queryParams.length}`;

    await db.query(sqlQuery, queryParams);

    // Add more details to log description based on fields updated
    if (updateFields.username) logDescription += `username to ${username}, `;
    if (updateFields.firstname) logDescription += `firstname to ${firstname}, `;
    if (updateFields.lastname) logDescription += `lastname to ${lastname}, `;
    if (updateFields.status) logDescription += `status to ${status}, `;
    logDescription = logDescription.slice(0, -2); // Remove the last comma and space

    // Assuming you have a way to get the current user's username and picture_url
    // Insert log entry
    await db.query(
      "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Account Updated', CURRENT_DATE, $3)",
      [req.user.username, logDescription, req.user.picture_url]
    );

    res.redirect("/manage");
  } catch (err) {
    console.error("Error updating account:", err);
    res.status(500).send("Internal Server Error");
  }
});




app.get("/logs", async (req, res) => {
  const currentPage = req.query.page ? parseInt(req.query.page, 10) : 1;
  const transTypeFilter = req.query.trans_type || null;
  const logsPerPage = 10;
  const offset = (currentPage - 1) * logsPerPage;
  let logsResult, countResult, totalLogs, query;

  try {
    if (transTypeFilter) {
      query = {
        text: "SELECT log_id, username, description, material_name, log_date, quantity, trans_type, picture FROM logs WHERE trans_type = $1 ORDER BY log_id DESC LIMIT $2 OFFSET $3",
        values: [transTypeFilter, logsPerPage, offset],
      };
      countResult = await db.query("SELECT COUNT(*) FROM logs WHERE trans_type = $1", [transTypeFilter]);
    } else {
      query = {
        text: "SELECT log_id, username, description, material_name, log_date, quantity, trans_type, picture FROM logs ORDER BY log_id DESC LIMIT $1 OFFSET $2",
        values: [logsPerPage, offset],
      };
      countResult = await db.query("SELECT COUNT(*) FROM logs");
    }

    totalLogs = parseInt(countResult.rows[0].count, 10);
    logsResult = await db.query(query);
    const logs = logsResult.rows;
    const totalPages = Math.ceil(totalLogs / logsPerPage);

    res.render("logs.ejs", {
      logs,
      currentPage,
      totalPages,
      logsPerPage,
      transTypeFilter // Pass the current filter back to the template
    });
  } catch (err) {
    console.error("Error fetching logs:", err);
    res.status(500).send("Internal Server Error");
  }
});

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
app.post("/add-item", async (req, res) => {
  const { materialName, clcode, price, available } = req.body;

  try {
    // Get the classification_id and description based on the provided clustercode
    const clusterQueryResult = await db.query("SELECT classification_id, description FROM cluster WHERE clustercode = $1", [clcode]);
    if (clusterQueryResult.rows.length === 0) {
      return res.status(400).send("Invalid cluster code.");
    }
    const classificationId = clusterQueryResult.rows[0].classification_id;
    const clusterDescription = clusterQueryResult.rows[0].description;

    // Insert the new item along with the cluster description
    await db.query(
      "INSERT INTO item (classification_id, material_name, clustercode, price, available, beginning_inventory, description) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [classificationId, materialName, clcode, price, available, available, clusterDescription] // setting beginning_inventory equal to available
    );

    if (req.isAuthenticated()) {
      const userPictureUrl = req.user.picture_url;
      const logDescription = `${req.user.username} added a new item: ${materialName} with cluster description: ${clusterDescription}`;
      await db.query(
        "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Added', CURRENT_DATE, $3)",
        [req.user.username, logDescription, userPictureUrl]
      );
    }
    
    res.redirect("/item");
  } catch (error) {
    console.error("Error adding item:", error);
    res.status(500).send("Internal Server Error");
  }
});


app.post('/delete-item', async (req, res) => {
  const { item_id } = req.body;
  try {
    await db.query('DELETE FROM item WHERE item_id = $1', [item_id]);
    res.json({ message: 'Item deleted successfully.' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item.' });
  }
});



app.post("/add-cluster", async (req, res) => {
  try {
      // Extract data from the request body
      const { clustercode, description, classificationid } = req.body;

      // Insert the cluster into the database
      await db.query(
          "INSERT INTO cluster (clustercode, description, classification_id) VALUES ($1, $2, $3)",
          [clustercode, description, classificationid]
      );

      // If the user is authenticated, log the action
      if (req.isAuthenticated()) {
          const currentUser = req.user; // The current logged-in user
          const logDescription = `${currentUser.username} added a new cluster: ${clustercode}`;

          // Insert the log entry into the logs table
          await db.query(
              "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Added', CURRENT_DATE, $3)",
              [currentUser.username, logDescription, currentUser.picture_url] // Use the current user's picture_url
          );
      }

      // Redirect back to the original page after adding the item
      res.redirect("/item");
  } catch (error) {
      console.error("Error adding cluster:", error);
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
      const roleOfResult = await db.query("SELECT role FROM users WHERE username = $1", [req.user.username]);
      const roleOf = roleOfResult.rows[0]?.role;

      // Fetch the latest updates for products
      const productUpdatesResult = await db.query(`
        SELECT * FROM logs 
        ORDER BY log_date DESC, log_id DESC
        LIMIT 3  -- Adjust the number as per your needs
      `);
      const productUpdates = productUpdatesResult.rows;

      // Calculate inventory subtotals
      const inventorySubtotalsResult = await db.query(`
        SELECT classification.classification_name, SUM(item.price * item.beginning_inventory) AS subtotal
        FROM item 
        INNER JOIN classification ON item.classification_id = classification.classification_id
        GROUP BY classification.classification_name
      `);
      const inventorySubtotals = inventorySubtotalsResult.rows;

      // Render the dashboard with all necessary data
      res.render("dashboard.ejs", {
        roleOf: roleOf,
        productUpdates: productUpdates,
        inventorySubtotals: inventorySubtotals,
      
      });

    } catch (err) {
      console.error("Error accessing the dashboard:", err);
      res.status(500).send("Internal Server Error");
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
      req.session.roleOf = roleOf.rows[0].role;
      res.render("generate-report-page.ejs", { roleOf: roleOf.rows[0].role });
      
    } catch (err) {
      console.log(err);
      res.redirect("/login");
    }
  } else {
    res.redirect("/login");
  }
});

app.post('/login',
  passport.authenticate('local', { failureRedirect: '/login-failed' }),
  function(req, res) {
    res.redirect('/dashboard');
  }
);

app.get('/login-failed', function(req, res) {
  const error = req.session.messages || 'Login failed';
  res.render('login.ejs', { error: error });
});

app.post('/addstock', async (req, res) => {
  const { clustercode, incoming, outgoing, itemDescription } = req.body;

  try {
    // Parse incoming and outgoing as integers
    const parsedIncoming = parseInt(incoming, 10);
    const parsedOutgoing = parseInt(outgoing, 10);

    // Check if parsing is successful
    if (isNaN(parsedIncoming) || isNaN(parsedOutgoing)) {
      res.status(400).send('Invalid incoming or outgoing values');
      return;
    }

    // Check if the item exists in the item table
    const itemCheckQuery = `SELECT * FROM item WHERE material_name = $1`;
    const itemCheckResult = await db.query(itemCheckQuery, [itemDescription]);

    if (itemCheckResult.rows.length === 0) {
      res.status(404).send('Item not found');
      return;
    }

    // Get the current available, total incoming, and total outgoing for the item
    const currentItem = itemCheckResult.rows[0];
    const newTotalIncoming = currentItem.total_incoming + parsedIncoming;
    const newTotalOutgoing = currentItem.total_outgoing + parsedOutgoing;
    const newAvailable = currentItem.available + parsedIncoming - parsedOutgoing;

    // Update the item with new totals
    const updateItemQuery = `
      UPDATE item
      SET available = $1,
          total_incoming = $2,
          total_outgoing = $3
      WHERE material_name = $4
    `;
    await db.query(updateItemQuery, [newAvailable, newTotalIncoming, newTotalOutgoing, itemDescription]);

    // If the user is authenticated, log the action
    if (req.isAuthenticated()) {
      const currentUser = req.user;
      const logDescription = `${currentUser.username} updated stock for item: ${itemDescription}`;

      // Insert the log entry into the logs table
      await db.query(
        "INSERT INTO logs (username, description, trans_type, log_date, quantity, picture) VALUES ($1, $2, 'Stock Update', CURRENT_DATE, $3, $4)",
        [currentUser.username, logDescription, newAvailable, currentUser.picture_url]
      );
    }

    res.redirect("/stock");
  } catch (err) {
    console.error('Error updating stock:', err);
    res.status(500).send('Internal Server Error');
  }
});












//////////////
app.post("/register", upload.single('picture'), async (req, res) => {
  const newUsername = req.body.username; // New user's username
  const password = req.body.password;
  const role = req.body.roles;
  const status = req.body.status;
  const picture = req.file ? req.file.filename : null; // New user's picture

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE username = $1", [newUsername]);

    if (checkResult.rows.length > 0) {
      // User already exists, redirect to an appropriate page
      res.redirect("/user-exists"); // Adjust as necessary
    } else {
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      await db.query(
        "INSERT INTO users (username, password, role, status, picture_url) VALUES ($1, $2, $3, $4, $5)",
        [newUsername, hashedPassword, role, status, picture]
      );

      // Log the action using the current session user's picture
      if (req.isAuthenticated()) {
        const currentUser = req.user; // The current logged-in user
        const logDescription = `${currentUser.username} registered a new user: ${newUsername}`;

        await db.query(
          "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, $3, CURRENT_DATE, $4)",
          [currentUser.username, logDescription, 'Added', currentUser.picture_url] // Use the current user's picture_url
        );
      }

      // Redirect to a page indicating successful registration
      res.redirect("/dashboard");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});





passport.use(new Strategy(
  async function(username, password, done) {
    try {
      const userQueryResult = await db.query("SELECT * FROM users WHERE username = $1", [username]);
      if (userQueryResult.rows.length > 0) {
        const user = userQueryResult.rows[0];
        
        // Check if the user's account status is 'inactive'
        if (user.status === 'inactive') {
          return done(null, false, { message: 'Account is inactive.' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (validPassword) {
          // User authenticated successfully, return the user object
          return done(null, {
            userid: user.userid,
            username: user.username,
            picture_url: user.picture_url  // The name of your column in the users table
          });
        } else {
          // Password did not match
          return done(null, false, { message: 'Incorrect username or password.' });
        }
      } else {
        // No user found with that username
        return done(null, false, { message: 'Incorrect username or password.' });
      }
    } catch (err) {
      return done(err);
    }
  }
));


// Specify how to serialize the user for the session
passport.serializeUser((user, done) => {
  // Save only the userid in the session to keep the session size small
  done(null, user.userid);
});
passport.deserializeUser(async (userid, done) => {
  try {
    const userQueryResult = await db.query("SELECT userid, username, picture_url FROM users WHERE userid = $1", [userid]);
    if (userQueryResult.rows.length > 0) {
      const user = userQueryResult.rows[0];
      done(null, user);
    } else {
      done(null, false);
    }
  } catch (err) {
    done(err);
  }
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
