FROM rust:latest

MAINTAINER rhodey@anhonestefort.org

RUN apt update
RUN apt install -y \
  libusb-1.0.0 \
  libusb-1.0.0-dev \
  libsndfile1 \
  libsndfile1-dev \
  clang \
  libclang-dev \
  cmake

RUN curl -sL https://deb.nodesource.com/setup_10.x | bash -
RUN apt install -y nodejs

ENV HOME /root/rw
RUN mkdir -p ${HOME}/lib
WORKDIR $HOME
COPY lib/c lib/c

RUN mkdir -p lib/c/librtlsdr/build
WORKDIR ${HOME}/lib/c/librtlsdr/build
RUN cmake ../ -DINSTALL_UDEV_RULES=ON -DDETACH_KERNEL_DRIVER=ON
RUN make
RUN make install

WORKDIR ${HOME}/lib/c/liquid-dsp
RUN chmod +x bootstrap.sh
RUN ./bootstrap.sh && ./configure
RUN make
RUN make install
RUN ldconfig || true

RUN mkdir -p ${HOME}/lib/c/itpp/build
WORKDIR ${HOME}/lib/c/itpp/build
RUN cmake ../
RUN make -j`nproc`
RUN make install

RUN mkdir -p ${HOME}/lib/c/mbelib/build
WORKDIR ${HOME}/lib/c/mbelib/build
RUN cmake ../
RUN make
RUN make install

RUN mkdir -p ${HOME}/lib/c/dsd/build
WORKDIR ${HOME}/lib/c/dsd/build
RUN cmake ../
RUN make
RUN make install

WORKDIR $HOME
COPY lib/rs lib/rs

WORKDIR ${HOME}/lib/rs/rtl_rs
RUN rustup override add nightly
RUN cargo build --release
RUN cargo install --force --path .

WORKDIR ${HOME}/lib/rs/rtl_p25
RUN cargo build --target-dir liquid_dsp_rs
RUN rustup override add nightly
RUN cargo build --release
RUN cargo install --force --path .

WORKDIR $HOME
COPY lib/js lib/js
COPY bin bin
RUN chmod +x bin/*
RUN bin/entry.sh npmall

ENTRYPOINT ["bin/entry.sh"]
