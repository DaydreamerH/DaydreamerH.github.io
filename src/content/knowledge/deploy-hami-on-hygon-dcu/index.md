---
title: "Deploy HAMi on hygon-dcu"
description: "在成都超算的DCU上部署HAMi"
date: "2025-09-09 11:07:00"
category: "图形与高性能计算"
originalCategory: "图形与高性能计算"
track: "Rendering / HPC"
level: foundation
status: draft
published: false
minutes: 5
order: 1000
prerequisites: []
tags: ["GPU"]
source: "_posts"
---
# 获取GPU节点并加载DTK
```
sinfo
```
显示节点信息，寻找可用节点。

例如：
```
normal*           up   infinite    758   idle a05r1n19
```

查看节点信息：
```
scontrol show node a05r1n19
```

获取节点：

```
salloc -p normal -N 1 --nodelist=a05r1n19 --gres=dcu:4 --exclusive --time=04:00:00
```

获取成功输出：
```
salloc: Pending job allocation 46494518
salloc: job 46494518 queued and waiting for resources
salloc: job 46494518 has been allocated resources
salloc: Granted job allocation 46494518
salloc: Waiting for resource configuration
salloc: Nodes a05r1n19 are ready for job
```

登录：
```
ssh a05r1n19
```

为了安装HAMi，需要可用的DTK驱动，且能够使用`hy-smi`.

但如果直接使用`hy-smi`得到输出：`bash: hy-smi: command not found...`.

检查Module:
```
-bash-4.2$ module list
Currently Loaded Modulefiles:
  1) compiler/devtoolset/7.3.1   2) compiler/rocm/2.9           3) mpi/hpcx/2.11.0/gcc-7.3.1
```

我们需要将`rocm`替换为可用的dtk.

获取可用的Module:
```
...
compiler/rocm/dtk-24.04
compiler/rocm/dtk-24.04.2
compiler/rocm/dtk-25.04
...
```

随后加载Module:
```
-bash-4.2$ module unload compiler/rocm/2.9
-bash-4.2$ module load compiler/rocm/dtk-24.04
```

（在我使用的这台服务器上，25.04版本无法使用`hy-smi`)

```
-bash-4.2$ module list
Currently Loaded Modulefiles:
  1) compiler/devtoolset/7.3.1   2) mpi/hpcx/2.11.0/gcc-7.3.1   3) compiler/rocm/dtk-24.04
-bash-4.2$ hy-smi

============================ System Management Interface =============================
======================================================================================
DCU     Temp     AvgPwr     Perf     PwrCap     VRAM%      DCU%      Mode
0       49.0C    25.0W      auto     300.0W     0%         0%        N/A
1       48.0C    24.0W      auto     300.0W     0%         0%        N/A
2       47.0C    22.0W      auto     300.0W     0%         0%        N/A
3       47.0C    24.0W      auto     300.0W     0%         0%        N/A
======================================================================================
=================================== End of SMI Log ===================================
```

# 安装helm

手动上传helm安装包后，解压：
```
-bash-4.2$ tar -zxvf helm-v3.19.0-rc.1-linux-amd64.tar.gz
linux-amd64/
linux-amd64/README.md
linux-amd64/LICENSE
linux-amd64/helm
```

接下来就可以直接使用helm:
```
-bash-4.2$ ./linux-amd64/helm version
version.BuildInfo{Version:"v3.19.0-rc.1", GitCommit:"3d8990f0836691f0229297773f3524598f46bda6", GitTreeState:"clean", GoVersion:"go1.24.6"}
```

但为了方便，先设置系统路径，再使用更好：
```
-bash-4.2$ export PATH=$PATH:/public/home/xxx/helm/linux-amd64
-bash-4.2$ helm version
version.BuildInfo{Version:"v3.19.0-rc.1", GitCommit:"3d8990f0836691f0229297773f3524598f46bda6", GitTreeState:"clean", GoVersion:"go1.24.6"}
```

# 配置Kubernetes
为了让HAMi能够发挥作用，需要为他提供Kubernetes API Server，从普遍角度来讲，我需要root或至少sudo权限，但是我没有。

为此需要考虑使用rootless的配置。

## k3s
这对我而言并不可行
