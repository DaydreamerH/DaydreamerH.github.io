---
title: "DCU虚拟化"
description: "DCU虚拟化实现方案中途总结"
date: "2026-02-27"
category: "图形与高性能计算"
originalCategory: "杂七杂八"
track: "Rendering / HPC"
level: intermediate
status: ready
published: true
minutes: 13
order: 1000
prerequisites: []
tags: ["golang", "DCU", "k8s"]
source: "_posts"
---
- [技术框架](#技术框架)
  - [总体介绍](#总体介绍)
  - [Kubernetes 原理与功能](#kubernetes-原理与功能)
    - [系统概述](#系统概述)
    - [Kubernetes 资源模型](#kubernetes-资源模型)
    - [Device Plugin 机制](#device-plugin-机制)
    - [Kubernetes 调度机制](#kubernetes-调度机制)
  - [HAMi 原理与功能](#hami-原理与功能)
    - [系统概述](#系统概述-1)
    - [设备虚拟化能力](#设备虚拟化能力)
    - [系统架构组成](#系统架构组成)
- [HAMi 适配工作](#hami-适配工作)
  - [未知设备编号识别与算力基准定义](#未知设备编号识别与算力基准定义)
  - [缺失序列号](#缺失序列号)
  - [补充厂商 ID](#补充厂商-id)
  - [过滤非计算设备编号](#过滤非计算设备编号)
  - [长序列号引起的映射异常修复](#长序列号引起的映射异常修复)
- [性能测试与指标完成情况](#性能测试与指标完成情况)
  - [测试硬件](#测试硬件)
  - [测试环境](#测试环境)
  - [算力资源最小切分粒度](#算力资源最小切分粒度)
  - [性能损耗测试](#性能损耗测试)
    - [测试程序](#测试程序)
    - [测试条件](#测试条件)
    - [测试结果](#测试结果)
- [结论](#结论)
- [未来计划](#未来计划)
## 技术框架
### 总体介绍
本次国产计算卡虚拟化方案采用 Kubernetes 作为集群编排核心，基于 HAMi (Heterogeneous AI Management Infrastructure) 异构算力管理框架实现。

### Kubernetes 原理与功能
#### 系统概述
Kubernetes 是一个面向容器化应用的开源集群管理平台，用于实现容器应用的自动化部署、资源调度、弹性伸缩与运行维护。Kubernetes 通过统一的资源抽象模型，将集群中的计算、存储及网络资源进行标准化管理，并以声明式方式驱动系统状态收敛。

Kubernetes 采用控制平面（Control Plane）与工作节点（Worker Node）的分层架构。控制平面负责全局资源调度与状态维护，工作节点负责具体的容器运行与资源隔离。系统通过 API Server 提供统一的控制接口，通过调度器（Scheduler）完成资源匹配，并通过节点代理（Kubelet）调用容器运行时完成容器生命周期管理。

#### Kubernetes 资源模型
Kubernetes 将集群资源抽象为可调度对象，并通过 Pod 的资源请求（Request）与资源限制（Limit）进行管理。常见资源包括：
- CPU
- Memory
- Storage
- 扩展设备资源（Extended Resources）

其中 CPU 与 Memory 属于可细粒度分配资源，支持共享与配额控制；而 GPU 或其他计算器通常以设备形式存在，属于扩展资源。
扩展资源的基本特点包括：
- 以整数形式分配；
- 不支持超分配；
- 不支持细粒度切分；
- 不参与 Kubernetes 原生资源压缩机制。

因此，在原生模型下，计算资源通常以整设备形式分配，无法直接表达显存容量或计算能力比例。

#### Device Plugin 机制
为了支持异构硬件，Kubernetes 引入 Device Plugin 框架，使硬件厂商能够通过插件方式向 Kubernetes 注册设备资源。

Device Plugin 的核心职责包括：
- 发现节点上的硬件设备；
- 向 Kubelet 注册设备资源；
- 在容器创建阶段分配设备；
- 返回设备节点信息及运行参数。

Device Plugin 工作流程如下：

1. 插件启动并向 Kubelet 注册；
2. 插件周期性上报设备状态；
3. 当 Pod 请求设备资源时，Kubelet 调用 Allocate 接口；
4. 插件返回设备节点映射信息；
5. 容器运行时完成设备挂载。

Device Plugin 并不直接参与调度算法，也不负责资源隔离，其作用仅限于设备发现与分配。

由于 Device Plugin 不具备显存与计算资源的控制能力，因此在 GPU/DCU 场景中仍需额外的资源管理层。

#### Kubernetes 调度机制
Kubernetes 调度器负责根据 Pod 的资源需求选择合适的节点，其核心流程包括：
1. Filter 阶段：筛选满足资源条件的节点；
2. Score 阶段：对候选节点进行打分；
3. Bind 阶段：将 Pod 绑定到目标节点。

调度器默认仅感知以下资源：
- CPU 使用量
- 内存使用量
- 扩展设备数量

对于 GPU 内部结构（如显存、计算单元），调度器并不具备感知能力，因此无法进行细粒度调度。

### HAMi 原理与功能
#### 系统概述
HAMi 是一种面向 Kubernetes 的异构加速设备管理中间件，用于在容器化环境中实现多类型计算资源的统一管理与调度。

HAMi 的前身为 k8s-vGPU-scheduler，其设计目标是在 Kubernetes 集群中对不同类型的异构计算设备进行统一抽象，并提供设备共享与资源隔离能力，从而提升加速设备的利用率。

HAMi 支持多种异构设备，包括但不限于：
- GPU
- NPU
- DCU

HAMi 的核心目标包括：
- 支持异构设备统一管理；
- 支持设备资源共享；
- 支持基于拓扑与策略的调度优化；
- 在不修改用户应用程序的前提下提供虚拟化能力。

HAMi 并不替代 Kubernetes，而是在其资源模型基础上扩展异构设备管理能力。

HAMi 的主要功能包括：
- 异构设备资源抽象
- 设备共享（Device Sharing）
- 设备资源隔离（Device Resource Isolation）
- 调度扩展（Scheduler Extension）

#### 设备虚拟化能力
HAMi 提供面向异构计算设备的设备虚拟化能力，其实现方式为软件层资源管理。

HAMi 支持以下两类核心能力：

（1）设备共享（Device Sharing）
HAMi 支持多个容器共享同一物理设备，并通过资源参数控制使用范围。可配置的资源维度包括：
- 设备计算核心使用比例
- 设备显存容量

例如，用户可以通过资源字段指定：

```
resources:
  limits:
    nvidia.com/gpu: 1
    nvidia.com/gpumem: 3000
```
该配置表示：
- 使用 1 张物理 GPU；
- 在容器内部可见显存为 3000MB。

HAMi 支持：

- 部分显存分配；
- 部分计算资源分配；
- 无需修改应用程序。

该机制通过容器运行时与设备管理逻辑实现。

（2）设备资源隔离（Device Resource Isolation）
HAMi 支持对容器中的设备资源进行隔离，使不同任务之间的资源使用互不影响。

隔离维度主要包括：
- 显存容量隔离
- 计算资源隔离

在资源隔离场景中，容器内可见的设备资源会依据 Pod 的资源声明进行限制。

该隔离属于软件层资源控制机制。

#### 系统架构组成

HAMi 由多个组件构成，主要包括：

（1）Mutating Webhook

Mutating Webhook 用于在 Pod 创建阶段对资源配置进行修改或补充，使其符合 HAMi 的资源模型。

（2）Scheduler Extender

Scheduler Extender 用于扩展 Kubernetes 调度器，使调度过程能够识别异构设备资源，并根据策略进行分配。

（3）Device Plugin

HAMi 为不同设备提供对应的 Device Plugin，用于：
- 设备发现
- 设备注册
- 设备分配

该机制基于 Kubernetes Device Plugin 框架实现。

（4）容器内虚拟化机制

HAMi 针对不同加速设备提供容器内资源控制技术，用于实现设备共享与资源隔离。

官方文档将其描述为： `in-container virtualization technics`，具体实现依赖设备类型及其运行时环境。

## HAMi 适配工作
由于本次适配的 DCU 较为特殊，公开的 HAMi 框架无法完成相应虚拟化功能，需要对 `dcu-vgpu-device-plugin` 做一定的修改。

### 未知设备编号识别与算力基准定义
HAMi 通过设备 ID 来识别显卡型号并查表获取其物理算力（Compute Units, CU）。测试使用的DCU的设备编号 66a1 属于新型号，原代码库无法识别该 ID，会导致设备枚举失败或 CU 总数读取错误（默认为 0），从而使“按比例切分算力”的功能失效。

在 `pkg/dcgm/structs.go` 中，将设备编号 66a1 映射为自定义型号名称 WK100。
在 `computeUnitType` 映射表中，显式定义 WK100 的物理算力为 64 CU。
```
var type2name = map[string]string{
	// 其他型号略
  // 新增66a1型号，根据HAMi历史提交记录，该型号曾被命名为WK100
  "66a1": "WK100",
}

var computeUnitType = map[string]float64{
	// 其他型号略，
  // 新增WK100型号，记录64个CU数量
  "WK100":        64,
}
```

### 缺失序列号
HAMi 的虚拟化映射表强依赖于显卡的物理序列号，作为全局唯一键；但本次需适配的 DCU 返回序列号为空值，所以需重新实现 `rsmiDevSerialNumberGet` 函数，引入降级处理逻辑：
当标准序列号获取失败或结果为空时，自动调用 `rsmi_dev_unique_id_get` 获取硬件唯一 ID（Unique ID）,确保了在任何驱动环境下都能获取到一个稳定的、唯一的设备标识符。

```
// rsmiDevSerialNumberGet 获取设备序列号
// 修改：当SN获取失败时，获取UniqueId
func rsmiDevSerialNumberGet(dvInd int) (string, error) {
    buf := make([]C.char, 256)

    ret := C.rsmi_dev_serial_number_get(C.uint32_t(dvInd), &buf[0], 256)

    tempSN := strings.TrimSpace(C.GoString(&buf[0]))
    err := errorString(ret)

    if err != nil || tempSN == "" || tempSN == "N/A" || tempSN == "UNKNOWN" || tempSN == "0x0" {
        glog.V(2).Infof("SN invalid (%s, err=%v), fallback to UniqueID", tempSN, err)

        var uid C.uint64_t
        retUID := C.rsmi_dev_unique_id_get(C.uint32_t(dvInd), &uid)

        if uidErr := errorString(retUID); uidErr != nil {
            return "", fmt.Errorf("SN and UniqueID both failed: %v, %v", err, uidErr)
        }

        return fmt.Sprintf("%016x", uint64(uid)), nil
    }

    return tempSN, nil
}
```
### 补充厂商 ID
本次适配的 DCU VendorID 仍然为 AMD 的 VendorID，故在 `dcu-vgpu-device-plugin/internal/pkg/util/util.go` 额外增加AMD厂商ID.
```
//HygonVendorID is the pci vendor id for hygon
HygonVendorID = "0x1d94"
//AMDVendorID is the pci vendor id for AMD, here for 66a1 DCU.
AMDVendorID   = "0x1002"
```
### 过滤非计算设备编号
`/dev/dri` 目录下不仅包含用于计算的渲染节点（renderD），还包含用于显示的控制节点（card）以及各种连接器目录。若不加过滤地注册这些路径，会导致容器挂载错误的设备节点，引发运行时错误。

在设备发现逻辑中，通过引入双重过滤机制实现了对非计算设备的精确排除：系统首先进行路径前缀筛选，仅保留以 card 或 render 开头的字符设备以消除目录干扰，随后深入遍历 `/sys/class/drm` 目录读取硬件真实的 vendor 属性，强制跳过不属于海光（0x1d94）或相关兼容标识（0x1002）的非目标厂商设备。配合对 card 与 render 节点数量的一致性校验，这一改进不仅排除了主板集成显卡等无关硬件的干扰，更确保了虚拟化映射在逻辑索引与物理路径之间具备严谨的一一对应关系。
```
// ListDcuDrmDevices list all drm devices, and filter it by dcu vendorID
func ListDcuDrmDevices() ([]string, []string, error) {
    filenames := make([]string, 0)
    dcuDrms := make([]string, 0)
    dcuRenders := make([]string, 0)

    files, err := os.ReadDir(LocationDri)
    if err != nil {
        klog.Errorf("ListDcuDrmDevices list dri directory error: %v", err.Error())
        return nil, nil, err
    }

    // 第一步：收集所有的 card 和 render 节点名
    for _, f := range files {
        // card0-VGA-1 等连接器通常是目录，会被 f.IsDir() 过滤掉
        if f.IsDir() {
            continue
        }

        name := f.Name()
        if strings.HasPrefix(name, DriPrefixCard) || strings.HasPrefix(name, DriPrefixRender) {
            filenames = append(filenames, name)
        }
    }

    // 排序以确保逻辑索引一致
    sort.Sort(DrmSlice(filenames))

    // 第二步：通过 VendorID 筛选真正的 DCU 设备
    for _, f := range filenames {
        vendorPath := fmt.Sprintf("/sys/class/drm/%s/device/vendor", f)
        vendorID, err := os.ReadFile(vendorPath)
        if err != nil {
            // 即使某块卡读取失败，也继续处理下一块，防止整个节点 GPU 丢失
            klog.Warningf("ListDcuDrmDevices skip dev %s: read vendor file error: %v", f, err)
            continue
        }

        fixedVendorID := strings.TrimSpace(string(vendorID))

        // --- 核心修改：尝试匹配 Hygon (0x1d94) 或 AMD (0x1002) ---
        if fixedVendorID != HygonVendorID && fixedVendorID != AMDVendorID {
            klog.Infof("ListDcuDrmDevices dri dev %s vendorID %s is not a supported DCU, skip it", f, fixedVendorID)
            continue
        }

        if strings.HasPrefix(f, DriPrefixCard) {
            dcuDrms = append(dcuDrms, f)
        } else if strings.HasPrefix(f, DriPrefixRender) {
            dcuRenders = append(dcuRenders, f)
        }
    }

    // 最终校验
    if len(dcuDrms) != len(dcuRenders) {
        return nil, nil, fmt.Errorf("ListDcuDrmDevices dcuDrms %v and dcuRenders %v length not equal", dcuDrms, dcuRenders)
    }

    return dcuDrms, dcuRenders, nil
}
```
### 长序列号引起的映射异常修复
在开源社区版本的 dcu-vdev-device-plugin 中，由于历史版本的逻辑更迭，代码存在标识符引用不一致的遗漏问题。

在之前的更新中，社区试图引入物理序列号（Serial Number）替代总线地址（PCI Bus Address）作为区分物理显卡的唯一主键，以增强跨节点设备识别的稳定性。然而，该次更新未能完整覆盖所有底层索引函数（如虚拟设备配置生成与 UUID 映射逻辑），部分场景下，存在双方案的混用，甚至可能导致内存越界。

在 `dcu-vgpu-device-plugin-master/internal/pkg/util/util.go` 引入新的函数：
```
func GetDeviceUUIDFromDevSerialNumber(devSerialNumber string) string {
	return fmt.Sprintf("DCU-%s", devSerialNumber)
}

func GetDevSerialNumberFromDeviceUUID(uuid string, devSerialNumber *string) (int, error) {
	return fmt.Sscanf(uuid, "DCU-%s", devSerialNumber)
}
```
在 `dcu-vgpu-device-plugin-master/internal/pkg/dcu/server.go` 的
 `createvdevFiles` 函数中，引入了 `devSerialNumber2IdxMapper` 统一映射器。该逻辑在配置下发前，强制将从 K8s 侧收到的长 UUID 重新通过序列号映射回底层的逻辑索引 idx。这一步骤通过显式的判空与异常拦截，确保了无论物理序列号长度如何变化，其对应的逻辑索引始终在安全范围内。
```
// Create virtual vdev directory and file
func (p *Plugin) createvdevFiles(current *corev1.Pod, ctr *corev1.Container, req util.ContainerDevices) (string, error) {
	var devidx, pipeid, vdevidx int
	var pcibusId string
	var reqcores, mem int32
	var err error
	coremsk1 := initCoreUsage(16)
	coremsk2 := initCoreUsage(16)
	reqtmp := 0
	if len(req) > 1 {
		return "", nil
	}

	devSerialNumber2IdxMapper, err := util.GetSerialNumberToDvIdMap(p.devices)
	if err != nil {
		return "", fmt.Errorf("failed to get serial number map: %w", err)
	}
	for _, val := range req {
		if len(val.UUID) == 0 {
			continue
		}
		var devSerialNumber = ""
		succeedCount, err := util.GetDevSerialNumberFromDeviceUUID(val.UUID, &devSerialNumber)
		if err != nil || succeedCount == 0 || devSerialNumber == "" {
			klog.Errorf("Invalid request device uuid: %s", val.UUID)
			return "", fmt.Errorf("invalid request device uuid %s", val.UUID)
		}

		idx, ok := devSerialNumber2IdxMapper[devSerialNumber]
		if !ok {
			klog.Errorf("Device serial number %s not found in mapper", devSerialNumber)
			return "", fmt.Errorf("device serial number %s not found in mapper", devSerialNumber)
		}
		pcibusId = p.devices[idx].PciBusNumber
		reqcores = (val.Usedcores * int32(p.devices[idx].ComputeUnit)) / 100
		coremsk1, reqtmp, _ = allocCoreUsage(p.coremask[idx][0], int(reqcores))
		if reqtmp > 0 {
			coremsk2, _, _ = allocCoreUsage(p.coremask[idx][1], reqtmp)
		}
		mem = val.Usedmem
		devidx = idx
		vdevidx, err = p.AllocateVidx()
		if err != nil {
			return "", err
		}
		pipeid, err = p.AllocatePipeID(idx)
		if err != nil {
			return "", err
		}
	}
	dirName := string(current.UID) + "_" + ctr.Name + "_" + fmt.Sprint(devidx) + "_" + fmt.Sprint(pipeid) + "_" + fmt.Sprint(vdevidx) + "_" + fmt.Sprint(coremsk1) + "_" + fmt.Sprint(coremsk2)
	cacheFileHostDirectory := fmt.Sprintf("/usr/local/vgpu/dcu/%s", dirName)
	err = createvdevFile(pcibusId, coremsk1, coremsk2, reqcores, mem, 0, vdevidx, pipeid, cacheFileHostDirectory, "vdev0.conf")
	if err != nil {
		return "", err
	}
	// support dcu-exporter
	err = createvdevFile(pcibusId, coremsk1, coremsk2, reqcores, mem, devidx, vdevidx, pipeid, "/etc/vdev/", fmt.Sprintf("vdev%d.conf", vdevidx))
	if err != nil {
		return "", err
	}

	coreUsage1, err := addCoreUsage(p.coremask[devidx][0], coremsk1)
	if err != nil {
		return "", err
	}
	p.coremask[devidx][0] = coreUsage1

	coreUsage2, err := addCoreUsage(p.coremask[devidx][1], coremsk2)
	if err != nil {
		return "", err
	}
	p.coremask[devidx][1] = coreUsage2

	return cacheFileHostDirectory, nil
}
```
修改 `dcu-vgpu-device-plugin-master/internal/pkg/dcu/register.go` 中的 `apiDevices`，更新 `Id` 的获取方式 ：
```
func (r *Plugin) apiDevices() (*[]*api.DeviceInfo, error) {
	res := []*api.DeviceInfo{}

	klog.Infof("Getting device serial numbers")
	deviceSerialInfos, err := util.GetDeviceSerialInfos(r.devices)
	if err != nil {
		return nil, fmt.Errorf("failed to get device serial numbers: %w", err)
	}
	klog.Infof("Device serial numbers retrieved: %v", deviceSerialInfos)

	for idx, val := range r.devices {
		if val.MemoryTotal > 0 {
			res = append(res, &api.DeviceInfo{
				Index:   val.DvInd,
				Id:      util.GetDeviceUUIDFromDevSerialNumber(deviceSerialInfos[idx].SerialNumber),
				Count:   4,
				Devmem:  int32(val.MemoryTotal / 1024 / 1024),
				Devcore: 100,
				Numa:    0,
				Type:    val.DevTypeName,
				Health:  true,
			})
		}
	}
	return &res, nil
}
```

## 性能测试与指标完成情况

### 测试硬件
本次实验基于 DCU-7-01 物理节点进行。该节点搭载海光高性能加速卡，单物理卡具备 64 个计算单元 (CU) 和 16 GB 物理显存。

### 测试环境
实验运行于 CentOS Linux 7.6.1810 (Core) 操作系统之上。底层内核版本为 Linux Kernel 3.10.0-957.el7.x86_64。

硬件控制依赖于 Hygon SMI v1.6.0 驱动工具链（2024-09-30 发布版），负责底层的算力监控与虚拟化切分控制；上层开发环境则由 Hygon DTK 24.04 提供支持。

集群采用 Kubernetes v1.20.4 (Client/Server) 进行异构资源的统一调度与 Pod 管理。底层容器运行时使用 Containerd v1.3.0 (36cf5b6)，负责容器生命周期的维护以及物理设备路径的挂载映射。

测试镜像为 `harbor.sourcefind.cn:5443/dcu/admin/base/pytorch:2.1.0-centos7.6-dtk24.04-py310`，镜像内集成 DTK 24.04 运行库。

### 算力资源最小切分粒度
针对海光计算卡，适配完成后的 HAMi 理论上能够支持 核心 1%，内存 1M 的资源申请。

由于 K8s 扩展资源调度采用整数逻辑，且底层物理计算单元不可分割，本次测试通过 2% 的算力比例申请实现了物理极限对齐：
- 计算单元 (CU) 逻辑：$64 \text{ CU} \times 2\% = 1.28 \text{ CU}$。根据 HAMi 底层向下取整（Floor）的分配原则，实测应分配 1 CU。
- 显存 (Memory) 逻辑：直接指定 1 MB 强配额限制。

测试配置文件（dcu-vdev-granularity-test.yaml）如下：
```
apiVersion: v1
kind: Pod
metadata:
  name: dcu-vdev-granularity-test
spec:
  restartPolicy: Never
  containers:
    - name: pytorch
      image: harbor.sourcefind.cn:5443/dcu/admin/base/pytorch:2.1.0-centos7.6-dtk24.04-py310
      command: ["sleep", "infinity"]
      resources:
        limits:
          hygon.com/dcunum: 1
          hygon.com/dcumem: 1
          hygon.com/dcucores: 2
```
测试结果如下：
```
[user@DCU-7-01 yamls]$ kubectl apply -f dcu-vdev-granularity-test.yaml
pod/dcu-vdev-granularity-test created
[user@DCU-7-01 yamls]$ kubectl exec -it dcu-vdev-granularity-test -- /bin/bash
[root@dcu-vdev-granularity-test /]# source /opt/hygondriver/env.sh
[root@dcu-vdev-granularity-test /]# hy-virtual -show-device-info
warning: The hy-virtual clis has been porting into hy-smi tool, with the usage of <hy-smi virtual> instead, and this tool is going to deprecate.
Device 0:
Actual Device: 0
Compute units: 1
Global memory: 1048576 bytes
```

- `Compute Units: 1` 证实系统成功将 64 核物理卡切分为最小计算颗粒度（单核），验证了 1.56% (1/64) 级别的理论分辨率。
- `Global Memory: 1048576 bytes` 证实显存隔离精确控制在 1MB。

### 性能损耗测试
#### 测试程序
本测试采用高精度矩阵乘法（GEMM）作为算力负载模型，通过 $8192 \times 8192$ 维度的浮点运算（FP32）对不同资源配额下的 Pod 进行压测。

- 算力评价：依据理论公式 $TFLOPS = \frac{2 \times N^3}{duration \times 10^{12}}$ 计算实测有效吞吐量。
- 统计严谨性：每组测试均包含 10 轮预热及 50 轮正式采样，通过计算标准差（Std Dev）评估性能抖动。

测试程序如下：
```
import torch
import numpy as np

def benchmark_cu_precise(n_size=8192, warmup_iters=10, test_iters=50):
    if not torch.cuda.is_available():
        print("未检测到 DCU 设备")
        return

    device = torch.device("cuda:0")
    a = torch.randn(n_size, n_size, device=device, dtype=torch.float32)
    b = torch.randn(n_size, n_size, device=device, dtype=torch.float32)

    start_event = torch.cuda.Event(enable_timing=True)
    end_event = torch.cuda.Event(enable_timing=True)

    print(f"正在预热 {warmup_iters} 轮...")
    for _ in range(warmup_iters):
        torch.matmul(a, b)
    torch.cuda.synchronize()
    print(f"开始采样 {test_iters} 轮...")
    latencies = []
    for i in range(test_iters):
        start_event.record()
        c = torch.matmul(a, b)
        end_event.record()
        torch.cuda.synchronize()
        curr_time_ms = start_event.elapsed_time(end_event)
        latencies.append(curr_time_ms)
        tflops = (2 * n_size**3) / (curr_time_ms / 1000) / 1e12
        print(f"Iter {i+1:02d}: {curr_time_ms:.2f} ms | {tflops:.2f} TFLOPS", end="\r")

    avg_ms = np.mean(latencies)
    std_ms = np.std(latencies)
    avg_tflops = (2 * n_size**3) / (avg_ms / 1000) / 1e12

    print("\n" + "="*45)
    print(f"测试结论")
    print(f"平均硬件耗时: {avg_ms:.3f} ms")
    print(f"耗时标准差:   {std_ms:.3f} ms")
    print(f"实测有效算力: {avg_tflops:.2f} TFLOPS")
    print("="*45)

if __name__ == "__main__":
    benchmark_cu_precise()
```
#### 测试条件
实验设置了四组对照 Pod 场景：
- dcu-fullcore (基准组)：通过独占模式申请全量物理卡资源，用于获取硬件原生性能基准。
- dcu-vdev-25/50/75core (实验组)：利用 HAMi 虚拟化中间件，分别划分 25% (16 CU)、50% (32 CU) 和 75% (48 CU) 的算力比例。

实验组均开启了显存隔离，例如 25% 算力组配合分配了 2048 MB (2 GB) 显存，以确保矩阵运算所需的内存空间。

以下展示了基准组与代表性实验组（25% 算力）的部署配置：
1. 全量核心配置 (dcu-fullcore.yaml)
```
apiVersion: v1
kind: Pod
metadata:
  name: dcu-fullcore
spec:
  restartPolicy: Never
  containers:
    - name: pytorch
      image: harbor.sourcefind.cn:5443/dcu/admin/base/pytorch:2.1.0-centos7.6-dtk24.04-py310
      command: ["sleep", "infinity"]
      resources:
        limits:
          hygon.com/dcunum: 1
```
2. 25% 算力切分配置 (dcu-vdev-25core.yaml)
```
apiVersion: v1
kind: Pod
metadata:
  name: dcu-vdev-25core
spec:
  restartPolicy: Never
  containers:
    - name: pytorch
      image: harbor.sourcefind.cn:5443/dcu/admin/base/pytorch:2.1.0-centos7.6-dtk24.04-py310
      command: ["sleep", "infinity"]
      resources:
        limits:
          hygon.com/dcunum: 1
          hygon.com/dcumem: 2048
          hygon.com/dcucores: 25
```


#### 测试结果
| 测试对象 (Pod) | 算力配额 | 平均硬件耗时 ($ms$) | 耗时标准差 ($ms$) | 实测算力 ($TFLOPS$) | 理论预期算力* ($TFLOPS$) | 性能增益/损耗 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **dcu-fullcore** | 100% | 92.669 | 0.191 | **11.86** | 11.860 | 基准 (Baseline) |
| **dcu-vdev-75core** | 75% | 117.705 | 0.082 | **9.34** | 8.895 | **+5.00%** |
| **dcu-vdev-50core** | 50% | 161.027 | 0.133 | **6.83** | 5.930 | **+15.18%** |
| **dcu-vdev-25core** | 25% | 316.340 | 0.128 | **3.48** | 2.965 | **+17.37%** |


> 注：理论预期算力由全卡实测基准（11.86 TFLOPS）按资源申请比例线性折算所得。


从测试结果可以看出，随着算力配额的降低，整体计算耗时按预期上升，实测 TFLOPS 与按比例折算的理论值保持同一量级，说明算力切分后仍能维持稳定的计算性能。

在 25%～75% 配额区间内，实测算力略高于线性折算值，表现出一定的非线性缩放特征。该现象在 GPU/DCU 的实际计算中较为常见，通常与以下因素相关：
- 计算与访存资源的负载比例变化；
- 不同规模下底层计算库的 kernel 选择差异；
- 硬件动态频率与功耗管理策略。

总体来看，在本次单任务测试条件下，虚拟化算力切分未引入明显的性能劣化，计算效率保持稳定。

各测试场景的耗时标准差均小于 0.2 ms，相对波动率较低，说明在当前测试负载下系统运行稳定，未出现明显性能抖动。

## 结论
实验数据证实，HAMi 框架在海光 DCU 平台已实现预期的切分粒度：

- 显存分配：成功通过 `hygon.com/dcumem: 1` 实现 1 MB 级别的物理显存限制，并在容器内部通过 hy-virtual 工具验证了视图与配额的一致性。
- 算力分配：通过 `hygon.com/dcucores: 2` 的配置，系统根据向下取整原则精准指派了 1 个物理计算单元 (CU)。鉴于该物理卡总计 64 CU，此项操作验证了 1.56% 的物理算力切分精度，逻辑上满足了“1% 算力”申请的技术可行性。

在本次测试规模与单任务运行条件下，未观测到虚拟化层引入的显著性能损耗，各算力比例下的计算性能与理论预期保持一致量级。

测试结果表明，HAMi 在海光 DCU 平台上能够完成基本的算力与显存切分，并保持稳定运行，满足当前阶段的功能验证与指标要求。

## 未来计划
排查部分场景下的日志警告信息，并进行更全面的测试。
