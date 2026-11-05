use crate::{Result, fail};
use std::{ffi::c_void, os::windows::ffi::OsStrExt, path::Path, ptr};
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE, LocalFree},
    Security::{
        Authorization::{
            ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
            SDDL_REVISION_1,
        },
        DACL_SECURITY_INFORMATION, GetTokenInformation, PROTECTED_DACL_SECURITY_INFORMATION,
        SetFileSecurityW, TOKEN_QUERY, TOKEN_USER, TokenUser,
    },
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};

struct Token(HANDLE);
impl Drop for Token {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}
struct Local(*mut c_void);
impl Drop for Local {
    fn drop(&mut self) {
        unsafe { LocalFree(self.0) };
    }
}

fn current_sid() -> Result<String> {
    // Query the process token, independent of mutable account-name environment variables.
    unsafe {
        let mut handle = ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut handle) == 0 {
            return fail("PRIVATE_PATH_UNAVAILABLE");
        }
        let token = Token(handle);
        let mut length = 0;
        GetTokenInformation(token.0, TokenUser, ptr::null_mut(), 0, &mut length);
        if length < size_of::<TOKEN_USER>() as u32 {
            return fail("PRIVATE_PATH_UNAVAILABLE");
        }
        // Word alignment permits reading TOKEN_USER from the returned token buffer.
        let mut data = vec![0usize; (length as usize).div_ceil(size_of::<usize>())];
        if GetTokenInformation(
            token.0,
            TokenUser,
            data.as_mut_ptr().cast(),
            length,
            &mut length,
        ) == 0
        {
            return fail("PRIVATE_PATH_UNAVAILABLE");
        }
        let user = &*data.as_ptr().cast::<TOKEN_USER>();
        let mut sid = ptr::null_mut();
        if ConvertSidToStringSidW(user.User.Sid, &mut sid) == 0 {
            return fail("PRIVATE_PATH_UNAVAILABLE");
        }
        let _allocation = Local(sid.cast());
        let mut length = 0;
        while *sid.add(length) != 0 {
            length += 1;
        }
        String::from_utf16(std::slice::from_raw_parts(sid, length))
            .map_err(|_| "PRIVATE_PATH_UNAVAILABLE".into())
    }
}

pub fn protect(path: &Path, directory: bool) -> Result<()> {
    let sid = current_sid()?;
    let inherit = if directory { "OICI" } else { "" };
    // Replace the complete protected DACL; retain no pre-existing explicit grants.
    let sddl: Vec<u16> = format!("D:P(A;{inherit};FA;;;{sid})(A;{inherit};FA;;;SY)")
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        let mut descriptor = ptr::null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            SDDL_REVISION_1,
            &mut descriptor,
            ptr::null_mut(),
        ) == 0
        {
            return fail("PRIVATE_PATH_UNAVAILABLE");
        }
        let _allocation = Local(descriptor);
        if SetFileSecurityW(
            path.as_ptr(),
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            descriptor,
        ) == 0
        {
            return fail("PRIVATE_PATH_UNAVAILABLE");
        }
    }
    Ok(())
}
