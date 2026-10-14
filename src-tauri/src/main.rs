// В release не открываем консольное окно рядом с приложением
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    swoop_lib::run()
}
