import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";

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

app.get("/register", (req, res) => {
  res.render("register.ejs");
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
      console.log(roleOf);
      console.log(req.session.username);////////////////////////////////////////////// important code take note!
   

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
      const {materialName, clcode} = req.body;
      console.log("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      var container =   await db.query("SELECT * FROM item WHERE clustercode = $1",[ clcode ]);
      const container1 = container.rows[0];
      //console.log(container1);
      console.log(clcode);
      console.log(materialName);
      const { classification_id } = container1;
      // Insert the item into the database
      
      console.log(clcode);
      await db.query(
          "INSERT INTO item (classification_id, material_name, clustercode) VALUES ( $1, $2, $3)",
          [ classification_id,materialName,clcode]
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


app.post(
  "/login", 
  passport.authenticate("local", {
    successRedirect: "/dashboard",
    failureRedirect: "/login",
  })
);

app.post("/register", async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const role = req.body.roles;
  const status = req.body.status;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    const roleOf = await db.query("SELECT role FROM users WHERE username = $1", [
      username,
    ]);
   

    if (checkResult.rows.length > 0) {
      req.redirect("/login");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          const result = await db.query(
            "INSERT INTO users (username, password, role, status) VALUES ($1, $2, $3, $4) RETURNING *",
            [username, hash, role, status]
          );
          const user = result.rows[0];
      
          req.login(user, (err) => {
            console.log("success");
            res.redirect("/dashboard");
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

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
