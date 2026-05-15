import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { UserRole } from 'src/modules/user/entities/user.entity';

function contextWithRole(role?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  } as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('allows admin users', () => {
    expect(guard.canActivate(contextWithRole(UserRole.ADMIN))).toBe(true);
  });

  it('rejects non-admin users', () => {
    expect(() => guard.canActivate(contextWithRole(UserRole.USER))).toThrow(
      ForbiddenException,
    );
  });
});
