export declare const hashPassword: (password: string) => Promise<string>;
export declare const comparePassword: (password: string, hashedPassword: string) => Promise<boolean>;
export declare const generateAccessToken: (userId: string, role: string) => string;
export declare const generateRefreshToken: (userId: string) => string;
export declare const verifyAccessToken: (token: string) => {
    sub: string;
    role: string;
};
export declare const verifyRefreshToken: (token: string) => {
    sub: string;
    type: string;
};
export declare const generateOtp: () => string;
//# sourceMappingURL=auth.d.ts.map