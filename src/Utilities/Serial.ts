import type { BindingPortInterface } from "@serialport/bindings-cpp";

export function closePort(port: BindingPortInterface) {
    if (port.isOpen) {
        port.close();
    }
}
