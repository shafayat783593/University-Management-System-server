import bcrypt from "bcryptjs";
import { Role } from "../../generated/prisma/enums.js";
import config from "../config/index.js";
import { prisma } from "../lib/prisma.js";





// export const seedSuperAdmin = async()=>{
//     try {
//      const isSuperAdminExist = await prisma.user.findFirst({
//         where:{
//             role:Role.SUPER_ADMIN
//         }
//      }) 
//      if(isSuperAdminExist){
//          console.log("super admin already exists")
//          return;

//      } 
//      const name=config.super_admin_name 
//      const password =config.super_admin_password
//      const email  =config.super_admin_email
//     if (!name || !email || !password) {
//     throw new Error("Super Admin Name, Email, Password missing in ENV file");
// }
//      const hashPassword = await bcrypt.hash(password,Number(config.bcrypt_salt_rounds))
//      const superAdmin = await prisma.user.create({
//         data:{
//             name,
//             email,
//             password:hashPassword,
//             role:Role.SUPER_ADMIN,
//             emailVerified:true,
//             needPasswordChange:false,
//         }
//      })
//      console.log("super admin created",superAdmin)


//     } catch (error) {
//         console.log("Error seeding super Admin :",error)
//         await prisma.user.delete({
//             where:{
//                 email:config.super_admin_email
//             }
//         })
//     }
// }



//create tester admin

export const seedTesterAdmin = async () => {
	try {
		const isTesterAdminExist = await prisma.user.findUnique({
			where: {
				email: config.tester_admin_email,
			},
		});

		if (isTesterAdminExist) {
			console.log("Tester Admin Already Exists!");
			return;
		}

		const name = config.tester_admin_name;
		const email = config.tester_admin_email;
		const password = config.tester_admin_password;

		if (!name || !email || !password) {
			throw new Error(
				"Tester Admin Name , Email, Password Missing In Env File!!!",
			);
		}

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const testerAdmin = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: Role.ADMIN,
				needPasswordChange: false,
				emailVerified: true,
			},
		});

		console.log("Tester Admin Created : ", testerAdmin);
	} catch (error) {
		console.log("Error Seeding Tester Admin : ", error);

		await prisma.user.delete({
			where: {
				email: config.tester_admin_email,
			},
		});
	}
};
