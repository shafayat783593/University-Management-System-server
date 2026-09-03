


import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
	NextFunction,
	type Application,
	type Request,
	type Response,
} from "express";
import httpStatus from "http-status";
import config from "./app/config/index.js";




const app: Application = express();

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

app.get("/test", async (req: Request, res: Response, next: NextFunction) => {
  try {


const grandIDToken = await getBkashIdToken()
console.log(grandIDToken) 

    res.status(httpStatus.OK).json({
      success: true,
      message: "Welcome to PHHealthcare System Backend",
	  data:null
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
});



app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/doctor", DoctorsRoute);
app.use("/api/v1/user",userRoutes);
app.use("/api/v1/appointment",AppointmentRoute)

// Basic route
app.get("/", async (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to PH Healthcare System Backend",
	});
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
