import { AlertTriangle } from "lucide-react";

export default function DeleteModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 text-red-600 mx-auto">
          <AlertTriangle size={24} />
        </div>
        <h3 className="text-lg font-bold mb-2 text-center">Delete Item?</h3>
        <p className="text-slate-500 mb-6 text-center">
          This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 bg-slate-100 rounded-xl font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-red-600 text-white rounded-xl font-medium"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
