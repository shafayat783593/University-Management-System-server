import { Router } from "express";
import { DepartmentController } from "./department.controller.js";
import { DepartmentValidation } from "./departmentValidate.js";
import { Role } from "../../../generated/prisma/enums.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { auth } from "../../middleware/auth.js";

const router = Router();

router.get("/", DepartmentController.getAllDepartments);
router.get("/:id", DepartmentController.getDepartmentById);
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