#!/usr/bin/env python3
"""cf-auto ipk 打包器（OpenWrt 23.05+ 新格式：外层 tar.gz 容器，内含
./debian-binary + ./control.tar.gz + ./data.tar.gz）。纯标准库。

用法: python build_ipk.py --out <out.ipk> --arch <x86_64|aarch64> \
    --bin <cf-auto-panel> --cfst <cfst二进制> --version <0.1.0>
"""
import argparse
import io
import os
import shutil
import tarfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def make_tar_gz(entries: list) -> bytes:
    """entries: [(arcname, abspath_or_None, mode)]；abspath=None 表示目录条目。"""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", format=tarfile.GNU_FORMAT) as tf:
        for arcname, abspath, mode in entries:
            info = tarfile.TarInfo(arcname)
            info.uid = 0
            info.gid = 0
            info.uname = "root"
            info.gname = "root"
            info.mode = mode
            info.mtime = int(time.time())
            if abspath is None:
                info.type = tarfile.DIRTYPE
                info.size = 0
                tf.addfile(info)
            else:
                info.size = os.path.getsize(abspath)
                with open(abspath, "rb") as src:
                    tf.addfile(info, src)
    return buf.getvalue()


def make_targz_from_bytes(entries: list) -> bytes:
    """entries: [(arcname, bytes, mode)] → tar.gz 字节流。"""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", format=tarfile.GNU_FORMAT) as tf:
        for arcname, data, mode in entries:
            info = tarfile.TarInfo(arcname)
            info.size = len(data)
            info.uid = 0
            info.gid = 0
            info.uname = "root"
            info.gname = "root"
            info.mode = mode
            info.mtime = int(time.time())
            tf.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--arch", required=True)
    ap.add_argument("--bin", required=True)
    ap.add_argument("--cfst", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--license", default=os.path.join(HERE, "..", "vendor", "CFST-LICENSE"))
    args = ap.parse_args()

    control_tpl = open(os.path.join(HERE, "control"), encoding="utf-8").read()
    bin_size = os.path.getsize(args.bin) + os.path.getsize(args.cfst)
    control = (control_tpl
               .replace("@VERSION@", args.version)
               .replace("@ARCH@", args.arch)
               .replace("@SIZE@", str(bin_size // 1024)))

    build_dir = os.path.join(HERE, "..", "build", "stage_" + args.arch)
    os.makedirs(build_dir, exist_ok=True)
    for fn, content in (("control", control),):
        with open(os.path.join(build_dir, fn), "w", newline="\n") as f:
            f.write(content)
    for fn in ("postinst", "prerm"):
        src = os.path.join(HERE, fn)
        with open(src, encoding="utf-8") as f:
            body = f.read()
        with open(os.path.join(build_dir, fn), "w", newline="\n") as f:
            f.write(body)
        os.chmod(os.path.join(build_dir, fn), 0o755)

    # ---- control.tar.gz ----
    c_entries = []
    for n in ("control", "postinst", "prerm"):
        p = os.path.join(build_dir, n)
        if os.path.exists(p):
            c_entries.append(("./" + n, p, 0o755 if n in ("postinst", "prerm") else 0o644))
    control_tgz = make_tar_gz(c_entries)

    # ---- data.tar.gz ----
    data_root = os.path.join(build_dir, "data")
    for p in ("usr/bin", "etc/init.d", "usr/share/doc/cf-auto"):
        os.makedirs(os.path.join(data_root, p), exist_ok=True)
    shutil.copyfile(args.bin, os.path.join(data_root, "usr/bin/cf-auto-panel"))
    shutil.copyfile(args.cfst, os.path.join(data_root, "usr/bin/cfst"))
    shutil.copyfile(os.path.join(HERE, "init.d", "cf-auto"), os.path.join(data_root, "etc/init.d/cf-auto"))
    if os.path.exists(args.license):
        shutil.copyfile(args.license, os.path.join(data_root, "usr/share/doc/cf-auto/CFST-LICENSE"))
    readme = os.path.join(HERE, "..", "README.md")
    if os.path.exists(readme):
        shutil.copyfile(readme, os.path.join(data_root, "usr/share/doc/cf-auto/README.md"))

    d_entries = [
        ("./usr", None, 0o755),
        ("./usr/bin", None, 0o755),
        ("./usr/bin/cf-auto-panel", os.path.join(data_root, "usr/bin/cf-auto-panel"), 0o755),
        ("./usr/bin/cfst", os.path.join(data_root, "usr/bin/cfst"), 0o755),
        ("./etc", None, 0o755),
        ("./etc/init.d", None, 0o755),
        ("./etc/init.d/cf-auto", os.path.join(data_root, "etc/init.d/cf-auto"), 0o755),
        ("./usr/share", None, 0o755),
        ("./usr/share/doc", None, 0o755),
        ("./usr/share/doc/cf-auto", None, 0o755),
        ("./usr/share/doc/cf-auto/CFST-LICENSE", os.path.join(data_root, "usr/share/doc/cf-auto/CFST-LICENSE"), 0o644),
    ]
    if os.path.exists(os.path.join(data_root, "usr/share/doc/cf-auto/README.md")):
        d_entries.append(("./usr/share/doc/cf-auto/README.md",
                          os.path.join(data_root, "usr/share/doc/cf-auto/README.md"), 0o644))
    data_tgz = make_tar_gz(d_entries)

    # ---- 外层容器：tar.gz { ./debian-binary, ./control.tar.gz, ./data.tar.gz } ----
    outer = make_targz_from_bytes([
        ("./debian-binary", b"2.0\n", 0o644),
        ("./control.tar.gz", control_tgz, 0o644),
        ("./data.tar.gz", data_tgz, 0o644),
    ])

    out_path = os.path.abspath(args.out)
    with open(out_path, "wb") as f:
        f.write(outer)
    print("IPK_OK %s (%d bytes)" % (out_path, len(outer)))


if __name__ == "__main__":
    main()
