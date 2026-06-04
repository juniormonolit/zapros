import type {
  NotificationChannel,
  SupplierAvailabilityStatus,
  SupplierKind,
  SupplierMemberRole,
  SupplierPriceModel,
  SupplierVehicleType,
  WavePriority,
} from "@/actions/supplier-org-types";
import {
  AVAILABILITY_STATUSES,
  NOTIFICATION_CHANNELS,
  PRICE_MODELS,
  SUPPLIER_KINDS,
  SUPPLIER_MEMBER_ROLES,
  VEHICLE_TYPES,
  WAVE_PRIORITIES,
} from "@/actions/supplier-org-types";

export const SUPPLIER_KIND_LABELS: Record<SupplierKind, string> = {
  manufacturer: "Производитель",
  dealer: "Дилер",
  carrier: "Перевозчик",
  mixed: "Смешанный",
};

export const WAVE_PRIORITY_LABELS: Record<WavePriority, string> = {
  favorite: "Избранный",
  verified: "Проверенный",
  normal: "Обычный",
  reserve: "Резерв",
  stop_list: "Стоп-лист",
};

export const SUPPLIER_MEMBER_ROLE_LABELS: Record<SupplierMemberRole, string> = {
  supplier_admin: "Администратор",
  supplier_user: "Пользователь",
};

export const VEHICLE_TYPE_LABELS: Record<SupplierVehicleType, string> = {
  manipulator: "Манипулятор",
  truck: "Грузовик",
  semitrailer: "Полуприцеп",
  dump_truck: "Самосвал",
  tonar: "Тонар",
  gazelle: "Газель",
  other: "Другое",
};

export const PRICE_MODEL_LABELS: Record<SupplierPriceModel, string> = {
  fixed: "Фиксированная",
  per_km: "За км",
  per_hour: "За час",
  negotiable: "Договорная",
};

export const AVAILABILITY_STATUS_LABELS: Record<
  SupplierAvailabilityStatus,
  string
> = {
  available: "Доступен",
  busy: "Занят",
  unknown: "Неизвестно",
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> =
  {
    email: "Email",
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    cabinet: "Кабинет",
  };

export {
  SUPPLIER_KINDS,
  WAVE_PRIORITIES,
  SUPPLIER_MEMBER_ROLES,
  VEHICLE_TYPES,
  PRICE_MODELS,
  AVAILABILITY_STATUSES,
  NOTIFICATION_CHANNELS,
};
