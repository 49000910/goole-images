@echo off
rem ============================================================
rem 离线安装依赖:使用仓库内 wheels/,不需要联网
rem 用法:双击运行,或在 scripts 目录执行 install_offline.bat
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0.."
python -m pip install --no-index --find-links wheels -r requirements.txt
if errorlevel 1 (
  echo.
  echo [失败] 离线安装出错,常见原因:
  echo   1. 目标机 Python 版本与 wheels 包内版本不一致(看 wheels 文件名里的 cp3xx)
  echo   2. 未安装 Python 或 python 不在 PATH
  echo   解决:在联网机器上执行 python scripts\download_deps.py --python-version 目标版本标签 重新打包
  pause
  exit /b 1
)
echo.
echo [成功] 依赖安装完成。验证: python gui_main.py 或 python main.py samples\sample_label.png
pause
