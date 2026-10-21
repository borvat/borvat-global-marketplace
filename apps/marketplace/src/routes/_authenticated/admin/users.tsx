import { createFileRoute } from "@tanstack/react-router";
import { DataTable, Row, Cell, StatusBadge, Metric, DemoAction, Card } from "@/components/demo/shell";
import { demoStores } from "@/demo/companies";

export const Route = createFileRoute("/_authenticated/admin/users")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Users & roles — Borvat Admin" },
      { name: "description", content: "Platform and merchant user access with role assignments." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Users & roles — Borvat Admin" },
      { property: "og:description", content: "Platform and merchant access." },
    ],
  }),
  component: AdminUsers,
});

const users = [
  { email: "owner@borvat.demo", role: "platform_admin", scope: "All merchants", lastActive: "2026-07-26 09:12", status: "active" },
  { email: "support1@borvat.demo", role: "support_agent", scope: "Customer + merchant inbox", lastActive: "2026-07-26 08:40", status: "active" },
  { email: "owner@vandenberg.demo", role: "shop_owner", scope: "Van den Berg Wonen", lastActive: "2026-07-26 08:10", status: "active" },
  { email: "logistiek@vandenberg.demo", role: "fulfilment", scope: "Van den Berg Wonen", lastActive: "2026-07-25 16:42", status: "active" },
  { email: "nieuw@merchant7.demo", role: "shop_owner", scope: "Pending onboarding", lastActive: "—", status: "invited" },
];

function AdminUsers() {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Users" value={String(users.length)} />
        <Metric label="Platform admins" value="1" />
        <Metric label="Support agents" value="1" />
        <Metric label="Pending invites" value="1" tone="warn" />
      </div>
      <DataTable columns={["User", "Role", "Scope", "Last active", "Status", ""]} minWidth={880}>
        {users.map((u) => (
          <Row key={u.email}>
            <Cell className="font-medium">{u.email}</Cell>
            <Cell className="font-mono text-[12px]">{u.role}</Cell>
            <Cell className="text-[12px]">{u.scope}</Cell>
            <Cell className="text-[12px]">{u.lastActive}</Cell>
            <Cell>
              <StatusBadge tone={u.status === "active" ? "good" : "warn"}>{u.status}</StatusBadge>
            </Cell>
            <Cell>
              <DemoAction label="Manage" size="sm" />
            </Cell>
          </Row>
        ))}
      </DataTable>
      <Card title="Role model" description="Roles are stored in a dedicated role table, never on profiles">
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
          <li>platform_admin — cross-merchant read plus governance actions.</li>
          <li>support_agent — dual-channel inbox only; no merchant data writes.</li>
          <li>shop_owner / fulfilment — scoped to a single merchant store ({demoStores.length} stores active).</li>
        </ul>
      </Card>
    </div>
  );
}
