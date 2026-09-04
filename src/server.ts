import app from "./app.js";
import config from "./app/config/index.js";
import { transporter } from "./app/lib/nodmailer.js";
import { prisma } from "./app/lib/prisma.js";
import { redisClient } from "./app/lib/redis.js";
import { seedTesterAdmin } from "./app/utils/seeds.js";






const PORT = config.port;

const main = async () => {
	try {
		await prisma.$connect();
		console.log("Connected to the database successfully.");
		await redisClient.connect();
		console.log("Redis Connected Successfully")
		 
		await transporter.verify();
		console.log("Notemailer Connected successfully")
		// await seedSuperAdmin()
		// await seedTesterDoctor()
		await seedTesterAdmin()
		// await deleteUnverifiedAndRejectedDoctors()
		app.listen(PORT, () => {
			console.log(`Server is running on port ${PORT}`);
		});
	} catch (error) {
		console.error("Error starting the server:", error);
		await prisma.$disconnect();
		process.exit(1);
	}
};

main();
