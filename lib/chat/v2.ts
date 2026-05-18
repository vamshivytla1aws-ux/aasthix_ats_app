import { query } from "@/lib/db";

export async function requireConversationMember(conversationId: number, userId: number) {
  const res = await query(
    `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  return !!res.rowCount;
}

export const reactionAggregateSql = `
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'emoji', r.emoji,
        'count', r.count,
        'users', r.users
      )
      ORDER BY r.emoji
    )
    FROM (
      SELECT
        mr.emoji,
        COUNT(*)::int AS count,
        jsonb_agg(
          jsonb_build_object('user_id', u.id, 'full_name', u.full_name)
          ORDER BY u.full_name
        ) AS users
      FROM message_reactions mr
      JOIN users u ON u.id = mr.user_id
      WHERE mr.message_id = m.id
      GROUP BY mr.emoji
    ) r
  ), '[]'::jsonb) AS reactions
`;

