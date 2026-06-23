---
title: "套接字编程（二）"
description: "客户软件设计"
date: "2023-10-16 13:50:51"
category: "计算机基础"
originalCategory: "套接字编程"
track: "Computer Science"
level: foundation
status: ready
published: true
minutes: 5
order: 1000
prerequisites: []
tags: ["socket", "c"]
photos: "banner.jpg"
source: "_posts"
---# 标识服务器的位置
客户可以使用多种方法找到某个服务器的IP地址和协议端口号：
- 在编译程序时，将服务器的IP地址和域名说明为常量
- 要求用户在启动程序时标定服务器
  - 使客户软件更具一般性
  - 可以改变服务器位置
- 从稳定存储设备中获得关于服务器的信息
- 使用某个单独的协议来找到服务器


# 分析地址参数
在大多数情况下，传递给客户程序的每个参数由字符串构成。
- 允许用户提供机器的域名
- 允许用户提供点分十进制表示的IP地址
- 允许用户指明协议端口和机器

客户必须用sockaddr_in的结构指明服务器地址

- inet_addr：接受一个点分十进制的字符串，返回一个二进制地址
- gethostbyname：接受一个ASCII字符串，含有某台机器的域名，返回一个hostent结构
  - hostent结构含有二进制表示的主机IP地址
  ```
  struct hostent{
    char *h_name;
    char **h_aliases;
    int h_addrtype;
    int h_length;
    char **h_addr_list;
  }
  ```
- getservbyname:两个参数指明期望的服务和协议。返回servent类型的指针
  - servent
  ```
  struct servent{
    char* s_name;
    char** s_aliases;
    int s_port;
    char* s_proto;
  }
  ```
- getprotobyname:由协议名返回协议号；返回一个protoent类型结构的地址
  - protoent
  ```
  struct protoent{
    char *p_name;
    char **p_aliases;
    char *p_proto;
  }
  ```

# TCP客户算法
## 分配套接字
1. 使用socket函数
2. 将协议和服务分别说明为PF_INET和SOCKET_STREAM
3. include语句包含一些定义常量的文件
4. 对于TCP/IP，第三个参数没有用

```
#include<sys/types.h>
#include<sys/socket.h>
int s;
s = socket(PF_INET,SOCKET_STREAM,0);
```
## 选择本地协议端口号
- 服务器运行于熟知端口，客户不是
- 客户使用端口规则
  - 该端口不与该机器其他进程使用端口冲突
  - 该端口没有被分配给熟知服务
- 客户TCP自动选择本地端口
  - connect调用的效果满足上述规则

## 选择本地IP地址的基本问题
- 对于只挂在一个网络上的主机是简单的
- 正确的选择依赖于选路信息，但应用程序很少使用选路信息，实际中存在的问题
  - 一个主机可能具有多个IP
  - 如果应用程序随机选择一个IP地址，可能选择一个与IP地址的接口并不匹配的地址
  - 可能能够正确工作，但是网络管理困难、混乱，可靠性降低
- 一般本地地址字段不填，允许客户自动选取本地IP地址

## 将TCP套接字连接到服务器上
- connect函数：允许TCP套接字发起连接
  - 强迫执行下层的三次握手
  - 超时或者建立连接后返回
  ```
  retcode = connect(sockfd,remaddr,remaddrlen);
  s:套接字的描述符
  remaddr:一个sockaddr_in类型结构的地址
  remaddrlen:第二个参数的长度
  ```
  - 四项任务
    - 对指明的套接字进行检测：有效，没有连接
    - 将第二个参数给出的端点地址填入套接字中
    - 为此套接字选择一个本地端点地址
    - 发起一个TCP连接，并返回一个值

## 使用TCP和服务器通信
1. 客户发送请求，等待响应
2. 发送请求：send
3. 等待响应：recv

```
send(s,req,strlen(req),0);
while((n=recv(s,bptr,buflen))>0){
  bptr+=n;
  buflen-=n;
}
```
## 从TCP连接中读取响应
1. 对send一次调用，对recv循环调用
2. TCP不保持记录的边界，面向流的概念
3. 可能会分片，并且单独封装传送

## 关闭TCP连接
1. close：从容关闭连接释放该套接字
   - 常常需要在客户服务器之间协调关闭事宜
     - 服务器不能关闭连接，不知客户请求是否完成
     - 客户不知道服务器发出的数据是否全部到达
2. 允许应用程序在一个方向关闭TCP连接
   - shutdown(s,direction);
     - direction：0不允许输入；1不允许输出；2双向关闭
   - 部分关闭可以让服务器发送完最后一个响应后，关闭连接

# UDP客户的编程算法
## 连接和非连接的UDP套接字
### 一般的UDP套接字
- 每次发送报文的时候指明远程目的地
- 使用灵活，便于同不同的服务器通信

### 连接的UDP通信
- 客户使用connect调用指明远程端点地址
  - 使用SOCK_DGRAM类型的套接字
  - 不发起任何分组交换，不检查远程端点合法性
  - 只是在套接字的数据结构记录远程端点的信息
- 不用重复指明远端地址收发报文
- 只和一个服务器交互比较方便

## 使用UDP和服务器通信
### 对于一般的UDP套接字
- sendto:发送报文，含有地址信息
- recvfrom:接收一个含有源地址的数据报

### 对于连接的UDP套接字
- 使用send发送报文
- 使用recv接收报文
- 每次send发送一个完整的报文
- 每次recv接收一个完整的报文，足够大缓存
- 不需要重复使用recv获得单个报文

# 针对客户程序的过程库例子
每个客户与服务器建立联系：
1. 选择协议
2. 查找服务器IP地址
3. 查找所期望的服务并将其映射到协议端口号
4. 分配套接字与之连接

## connectsock
```
/* 准备工作 */
#include<sys/types.h>
#include<sys/socket.h>

#include<netinet/in.h>
#include<arpa/inet.h>

#include<netdb.h>
#include<string.h>
#include<stdlib.h>

#ifndef INADDR_NONE
#define INADDR_NONE 0xffffffff
#endif

extern int errno;

int errexit(const char *format,...);

/* 函数变量定义 */
int connectsock(const char*host,const char*service,const char*transport)
/*
  Arguments:
    host:name of host to which connection is desired
    service:service associated with the desired port
    transport:name of transport protocol to use("tcp" r "udp")
*/
{
  struct hostent *phe;
  struct servent *pse;
  struct protoent *ppe;
  struct sockaddr_in sin;
  int s,type;

  memset(&sin,0,sizeof(sin));
  sin.sin_family = AF_INET;

  /* 取得端口号 */
  if(pse = getservbyname(service,transport))
    sin.sin_port = pse->s_port;
  else if((sin.sin_port=htons((unsigned short)atoi(service)))==0)
    errexit("can't get \"%s\" service entry\n",service);

  /* 获取IP地址 */
  if (phe = gethostbyname(host))
    memcpy(&sin.sin_addr,phe->h_addr,phe->h_length);
  else if((sin.sin_addr.s_addr=inet_addr(host))==INADDR_NONE)
    errexit("can't get \"%s\" host entry\n",host);

  /* 取得协议类型 */
  if((ppe = getprotobyname(transport))==0)
    erreixt("can't get \"%s\" protocol entry\n",transport);

  if(strcmp(transport,"udp")==0)
    type = SOCK_DGRAM;
  else type = SOCK_STREAM;

  /* 构成连接 */
  s = socket(PF_INET,type,ppe->p_proto);
  if(s<0)
    errexit("can't create socket: %s\n",strerror(errno));

  if(connect(s,(struct sockaddr*)&sin,sizeof(sin))<0)
    errexit("can't connect to %s.%s:%s\n",host,service,sterror(errno));

  return s;
}
```
## connectTCP
```
int connectTCP(const char*host,const char*service){
  return connectsock(host,service,"tcp");
}
```
## connectUDP
```
int connectUDP(const char*host,const char*service)
{
  rerturn connectsock(host,service,"udp");
}
```
# DAYTIME服务
- 允许用户获得当前的日期和时间
- 客户程序访问服务器获得信息
  - 格式：weekday,month,day,year,time-timezone
- 可以使用TCP也可以使用UDP实现，协议端口13

## TCP版本
只要连接到来，服务器就构造包含当前日期时间的文本字符串发送，然后关闭连接。
```
/* 客户 */
#include<unistd.h>
#include<stdlib.h>
#include<string.h>
#include<stdio.h>

extern int errno;

int TCPdaytime(const char*host,const char*service);
int errexit(const char *format, ...);
int connectTCP(const char*host,const char*service);

#defince LINELEN 128

int main(int argc,char*argv[]){
  char *host = "localhost";
  char *service = "daytime";

  switch(argc){
    case 1:
          host = "localhost";
          break;
    case 2:
          sevice = argv[2];
    default:
          fprintf(stderr,"usage:TCPdaytime[host[port]]\n");
          exit(1);
  }
  TCPdaytime(host,service);
  exit(0);
}

TCPdaytime(const char*host,const char*service){
  char buf[LINELEN+1];
  int s,n;

  s = connectTCP(host,sevice);
  while((n=read(s,buf,LINELEN))>0){
    buf[n] = '\0';  /* ensure null-terminated */
    (void)fputs(buf,stdout);
  }
}
```
- TCP提供一种流服务，而并不保持记录边界。
  - 发送应用程序和接收应用程序分开了
  - 发送2个64字节，可能接收1次或者3次完成
  - 一次TCP连接的读操作调用返回的字节数依赖于下层互联网络数据报的大小，可用的缓存空间以及穿越网络所遇到的时延
- 必须要重复调用recv或者read，直到获取所有数据
## UDP版本
服务器收到数据报，格式化当前日期、时间，将结果字符串放置到外发数据包中，发送给客户。
# TIME服务
- TIME服务使用端口37
- 可以使用TCP协议
  - 使用TCP的TIME服务器利用连接的出现激活输出，类似DAYTIME服务
  - 使用TCP的客户不用发送任何数据
- 也可以使用UDP访问TIME服务
  - 客户发出包含单个数据报的请求
  - 服务器从传入的数据报中取出地址和端口号
  - 服务器将当前时间编码为一个整数，使用上述地址和端口号发回给客户

## UDP版本
```
#include <sys/types.h>
#include<unistd.h>
#include<string.h>
#include<stdio.h>

#define BUFSIZE 64

#define UNIXPOCH 22089888800UL
#define MSG "what time is it?\n"

extern int serrno;

int connectUDP(const char *host,const char *service);
int errexit(const char *format, ...);

int main(int argc,char*argv[]){
  char *host = "localhost";
  char *service = "time";
  time_t now;
  int s,n;

  swicth(argc){
    case 1:
          host = "locahost";
          break;
    case 3:
          service = argv[2];
    case 2:
          host = argv[1]
          break;
    default:
          fprintf(stderr,"usage: UDPtime[host[port]]\n");
          exit(1);
  }

  s = connectUDP(host,service);

  (void) write(s,MSG,strlen(MSG));

  /* read the time */

  n - read(s,(char*)&now,sizeof(now));

  if(n<0)
    errexit("read failed:%s\n",strerror(errno));
  now =  ntohl((unsigned long)now);
  now -= UNIXEPOCH;
  printf("%s",ctime(&now));
  eixt(0);
}
```

# ECHO服务
- ECHO服务器返回从客户收到的所有数据
- 用户网络管理员测试可达性，调试协议软件，识别选路错误等
- TCP ECHO服务：接收连接请求，从连接中读取数据，在该连接上将数据写回。直到客户终止传送
- UDP ECHO服务：接收整个数据报，更具数据报指明的端口号和地址，返回整个数据报
