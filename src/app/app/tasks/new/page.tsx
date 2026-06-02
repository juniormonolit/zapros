import { NewTaskForm } from "@/components/tasks/new-task-form";

export const metadata = {
  title: "Новая задача",
};

export default function NewTaskPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-text-primary">
          Новая задача
        </h1>
        <p className="text-sm text-text-secondary">
          Вставьте текст задачи из Bitrix24, проверьте распознанные поля и
          сохраните задачу.
        </p>
      </div>
      <NewTaskForm />
    </div>
  );
}
