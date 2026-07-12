import { getAllUsers } from '../api/db_users.js';
try {
  const users = await getAllUsers();
  console.log("Users in DB:", users);
} catch (e) {
  console.error("ERROR:", e);
}
