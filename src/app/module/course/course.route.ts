import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { CourseValidation } from "./course.validation.js";
import { CourseController } from "./course.controller.js";


const router = Router();

router.get(
	"/",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	CourseController.getAllCourses,
);
router.get(
	"/:id",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	CourseController.getCourseById,
);
router.post(
	"/",
	auth(Role.ADMIN),
	validateRequest(CourseValidation.createCourseZodSchema),
	CourseController.createCourse,
);
router.patch(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(CourseValidation.updateCourseZodSchema),
	CourseController.updateCourse,
);
router.delete("/:id", auth(Role.ADMIN), CourseController.deleteCourse);

export const CourseRoutes = router;