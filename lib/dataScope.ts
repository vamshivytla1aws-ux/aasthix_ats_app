export function jobAccessPredicate(alias: string, userParam: string) {
  return `EXISTS (
    SELECT 1 FROM users scope_user
    WHERE scope_user.id = ${userParam}::bigint
      AND (
        lower(scope_user.role) IN ('workspace_owner', 'owner')
        OR COALESCE(scope_user.access_scope, 'own') = 'all'
        OR ${alias}.created_by_user_id = ${userParam}::bigint
        OR (
          COALESCE(scope_user.access_scope, 'own') = 'team'
          AND EXISTS (SELECT 1 FROM job_team scope_jt WHERE scope_jt.job_id = ${alias}.id AND scope_jt.user_id = ${userParam}::bigint)
        )
      )
  )`;
}

export function candidateAccessPredicate(alias: string, userParam: string) {
  return `EXISTS (
    SELECT 1 FROM users scope_user
    WHERE scope_user.id = ${userParam}::bigint
      AND (
        lower(scope_user.role) IN ('workspace_owner', 'owner')
        OR COALESCE(scope_user.access_scope, 'own') = 'all'
        OR ${alias}.created_by_user_id = ${userParam}::bigint
        OR EXISTS (
          SELECT 1 FROM applications scope_app
          WHERE scope_app.candidate_id = ${alias}.id
            AND (
              scope_app.created_by_user_id = ${userParam}::bigint
              OR scope_app.assigned_recruiter_user_id = ${userParam}::bigint
              OR (
                COALESCE(scope_user.access_scope, 'own') = 'team'
                AND EXISTS (SELECT 1 FROM job_team scope_jt WHERE scope_jt.job_id = scope_app.job_id AND scope_jt.user_id = ${userParam}::bigint)
              )
            )
        )
      )
  )`;
}
