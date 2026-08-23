export const EQUIPMENT_NAME_MAX_LENGTH = 8;

export function parseEquipmentNamingCommand(message, command) {
  const text = String(message || '').replace(/^#/, '');
  if (!text.startsWith(command)) return null;

  const payload = text.slice(command.length);
  const separator = payload.indexOf('*');
  if (separator < 1) return null;

  const originalName = payload.slice(0, separator).trim();
  const newName = payload.slice(separator + 1).trim();
  if (!originalName || !newName) return null;
  return { originalName, newName };
}

export function isEquipmentNameTooLong(name) {
  return [...String(name || '')].length > EQUIPMENT_NAME_MAX_LENGTH;
}
