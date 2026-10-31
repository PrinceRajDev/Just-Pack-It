// Delivery partner demo state. Real endpoints (assumption):
// POST /delivery/availability, POST /delivery/tasks/:id/accept|pickup|out|verify-otp|fail
import { createContext, useContext, useState, type ReactNode } from "react";
import { deliveryTasks } from "@/mocks/data";
import type { DeliveryTask } from "@/domain/types";

interface Ctx {
  online: boolean;
  setOnline: (v: boolean) => void;
  tasks: DeliveryTask[];
  setStatus: (id: string, s: DeliveryTask["status"]) => void;
}
const C = createContext<Ctx | null>(null);

export function DeliveryProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(false);
  const [tasks, setTasks] = useState(deliveryTasks);
  return (
    <C.Provider
      value={{
        online,
        setOnline,
        tasks,
        setStatus: (id, s) =>
          setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status: s } : t))),
      }}
    >
      {children}
    </C.Provider>
  );
}

export function useDelivery() {
  const c = useContext(C);
  if (!c) throw new Error("useDelivery outside provider");
  return c;
}
