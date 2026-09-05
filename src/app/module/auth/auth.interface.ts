import { Role } from "../../../generated/prisma/enums.js";

export interface IRegisterStudentPayload {
  name: string;
  email: string;
  password: string;
  departmentId: string;
  studentIdCode: string;
  phone?: string;
}

export interface IVerifyEmailPayload {
  email: string;
  otp: string;
}

export interface ILoginUserPayload {
  email: string;
  password: string;
}

export interface IGoogleLoginPayload {
  idToken: string;
}

export interface ICompleteProfilePayload {
  departmentId: string;
  studentIdCode: string;
  phone?: string;
}

export interface IForgotPasswordPayload {
  email: string;
}

export interface IResetPasswordPayload {
  email: string;
  otp: string;
  newPassword: string;
}


export interface IChangePasswordPayload {
  oldPassword: string;
  newPassword: string;
}

export interface IRequestUser {
  userId: string;
  name: string;
  email: string;
  role: Role;
}