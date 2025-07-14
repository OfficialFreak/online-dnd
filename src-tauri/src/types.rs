use std::sync::Mutex;

pub struct FrontendState {
    pub ready: Mutex<bool>,
}
