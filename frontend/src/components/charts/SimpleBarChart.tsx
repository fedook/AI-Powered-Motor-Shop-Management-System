import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";

interface Datum {
  name: string;
  value: number;
  label?: string;
}

const COLORS = ["#ea580c", "#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#14b8a6", "#6366f1"];

export function SimpleBarChart({
  data,
  valueFormatter,
}: {
  data: Datum[];
  valueFormatter?: (value: number) => string;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 8, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            formatter={(value: number) => [valueFormatter ? valueFormatter(value) : value, "Value"]}
            contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 12 }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
