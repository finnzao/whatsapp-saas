export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  tenantId: string;
  role: string;
}
