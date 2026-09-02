import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { DepartmentController } from "./dpartment.controller.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { DepartmentValidation } from "./departmentValidate.js";


const router = Router();

router.get(
	"/",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	DepartmentController.getAllDepartments,
);
router.get(
	"/:id",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	DepartmentController.getDepartmentById,
);
router.post(
	"/",
	auth(Role.ADMIN),
	validateRequest(DepartmentValidation.createDepartmentZodSchema),
	DepartmentController.createDepartment,
);
router.patch(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(DepartmentValidation.updateDepartmentZodSchema),
	DepartmentController.updateDepartment,
);
router.delete("/:id", auth(Role.ADMIN), DepartmentController.deleteDepartment);

export const DepartmentRoutes = router;