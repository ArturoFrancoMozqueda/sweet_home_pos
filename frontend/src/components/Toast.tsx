import { useEffect, useState } from "react";

interface ToastMessage {
  id: number;
  text: string;
}

let addToast: (text: string) => void;
let toastId = 0;

export function useToast() {
  return { showToast: (text: string) => addToast?.(text) };
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  addToast = (text: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  return (
    <>
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          {toast.text}
        </div>
      ))}
    </>
  );
}
