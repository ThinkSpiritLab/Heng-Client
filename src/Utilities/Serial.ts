import type { BindingPortInterface } from "@serialport/bindings-cpp";

export async function closePort(port: BindingPortInterface) {
    if (port.isOpen) {
        await port.close();
    }
}
