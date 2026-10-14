// Lays a module's methods onto a class, as if they had been written in it (not enumerable, like a class's own): how a
// big screen is split into files by what each part does (inventory/*.js onto Inventory). Two modules giving the same
// name is a mistake, not an override.
export function addMethods(cls, methods) {
  for (const [k, v] of Object.entries(methods)) {
    if (k in cls.prototype) throw new Error(`${cls.name}.${k} is defined twice`);
    Object.defineProperty(cls.prototype, k, { value: v, writable: true, configurable: true });
  }
}
