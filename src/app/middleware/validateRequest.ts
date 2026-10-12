import z from "zod";
import httpStatus from "http-status";

import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";

export const validateRequest= (zodSchema:z.ZodObject)=>{
    return catchAsync((req: Request, res: Response, next: NextFunction)=>{


      const payload = req.body?? {}
        const result = zodSchema.safeParse(payload);

            if (!result.success) {
                const message = result.error.issues
                    .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
                    .join(", ");
                throw new AppError(httpStatus.BAD_REQUEST, message || "Invalid request data")
            }
            req.body = result.data
            next()


    })

}
